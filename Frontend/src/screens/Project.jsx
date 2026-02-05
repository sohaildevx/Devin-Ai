import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import axios from "../config/axios";
import { initializeSocket, receiveMessage, sendMessage, disconnectSocket } from "../config/socket";
import { useAppContext } from "../context/context";
import Markdown from 'markdown-to-jsx'
import { getWebContainerInstance } from "../config/webContainer";
import Editor from '@monaco-editor/react';

const Project = () => {
  const Location = useLocation();
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [project,setProject] = useState(Location.state?.project || null);
  const [users, setUsers] = useState([]);
  const [isAddingCollaborators, setIsAddingCollaborators] = useState(false);
  const [addCollaboratorsError, setAddCollaboratorsError] = useState(null);
  const [messageInput, setMessageInput] = useState("");
  const { user, setUser } = useAppContext();
  const messageRef = useRef();
  const [fileTree, setFileTree] = useState({
    // "app.js": { file: { contents: "// Welcome to Devin AI!\nconsole.log('Hello, Devin AI!');\n" } },
  });

  const [currentFile, setCurrentFile] = useState(null);

  const [openFiles, setOpenFiles] = useState([]);

  // messages state replaces DOM innerHTML manipulation
  const [messages, setMessages] = useState([]);

  const [webContainer, setWebContainer] = useState(null);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalCommand, setTerminalCommand] = useState("");
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const terminalProcessRef = useRef(null);
  const terminalWriterRef = useRef(null);
  const terminalOutputRef = useRef(null);
  const runProcessRef = useRef(null); // Track the current run process
  
  // Socket connection status
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const socketRef = useRef(null);
  
  // AI Provider selection
  const [aiProvider, setAiProvider] = useState('gemini');

  // auto-scroll when messages change
  useEffect(() => {
    const box = messageRef.current;
    if (box) {
      box.scrollTop = box.scrollHeight;
    }
  }, [messages]);

  const pushIncomingMessage = (data) => {
    setMessages((prev) => [...prev, { ...data, incoming: true }]);
  };

  const pushOutgoingMessage = (data) => {
    setMessages((prev) => [...prev, { ...data, incoming: false }]);
  };

  // Start a WebContainer shell process to back the in-browser terminal
  useEffect(() => {
    if (!webContainer) {
      setTerminalOutput("Waiting for WebContainer to initialize...\n");
      return;
    }

    let cancelled = false;

    const startShell = async () => {
      try {
        if (terminalProcessRef.current) return;

        setTerminalOutput("Starting terminal shell...\n");
        
        const shell = await webContainer.spawn("jsh", {
          terminal: {
            cols: 80,
            rows: 24,
          },
        });

        if (cancelled) {
          if (shell.kill) shell.kill();
          return;
        }

        terminalProcessRef.current = shell;
        const writer = shell.input.getWriter();
        terminalWriterRef.current = writer;
        setIsTerminalReady(true);
        setTerminalOutput("Terminal ready. Type a command and press Enter.\n\n");

        const reader = shell.output.getReader();
        const decoder = new TextDecoder();

        const read = async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (!value) continue;
              const text = decoder.decode(value);
              setTerminalOutput((prev) => {
                const newOutput = prev + text;
                // Auto-scroll to bottom
                setTimeout(() => {
                  if (terminalOutputRef.current) {
                    terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
                  }
                }, 0);
                return newOutput;
              });
            }
          } catch (err) {
            console.error("Terminal stream error:", err);
            setTerminalOutput((prev) => `${prev}\n[Stream error: ${err.message}]\n`);
          }
        };

        read();
      } catch (err) {
        console.error("Failed to start WebContainer terminal:", err);
        setTerminalOutput((prev) => `${prev}\n[Terminal Error] ${err.message || String(err)}\n\nTry refreshing the page or check browser console for details.\n`);
        setIsTerminalReady(false);
      }
    };

    startShell();

    return () => {
      cancelled = true;
      if (terminalProcessRef.current?.kill) {
        terminalProcessRef.current.kill();
      }
      terminalProcessRef.current = null;
      terminalWriterRef.current = null;
      setIsTerminalReady(false);
    };
  }, [webContainer]);

  // Fetch user profile if not available in context
  useEffect(() => {
    const fetchUser = async () => {
      if (!user || !user._id) {
        try {
          const response = await axios.get('/user/profile');
          if (response.data && response.data.user) {
            setUser(response.data.user);
          }
        } catch (error) {
          console.error('Failed to fetch user profile:', error);
        }
      }
    };
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  useEffect(() => {
    // Don't initialize if user is not loaded
    if (!user || !user._id) {
      return;
    }

    const projectId = Location.state?.project?._id || Location.state?.projectId;
    
    if (!projectId) {
      console.error("No project ID found in location state");
      return;
    }

    const socket = initializeSocket(projectId);
    socketRef.current = socket;

    // Track connection status
    socket.on('connect', () => {
      setIsSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setIsSocketConnected(false);
    });

    socket.on('reconnect', () => {
      setIsSocketConnected(true);
    });

    if(!webContainer){
      getWebContainerInstance().then((instance)=>{
        setWebContainer(instance);
      })
    }

    
    const handleMessage = async (data) => {
      
      let message;

      try {
        message = JSON.parse(data.message);
      } catch (error) {
        console.warn("Message is not JSON, treating as plain text:", data.message);
        
        message = { 
          message: data.message,
          sender: data.sender || 'ai-bot',
          senderEmail: data.senderEmail || 'AI Assistant'
        };
      }

      

      
      const fileTreeData = message.fileTree || data.fileTree;
      
      if(fileTreeData){
        // Mount files to WebContainer
        if (webContainer) {
          try {
            await webContainer.mount(fileTreeData);
          } catch (err) {
            console.error("Failed to mount files to WebContainer:", err);
          }
        }
        setFileTree(fileTreeData || {});
        
        if (!currentFile && Object.keys(fileTreeData).length > 0) {
          const firstFileName = Object.keys(fileTreeData)[0];
          setCurrentFile(firstFileName);
          setOpenFiles([firstFileName]);
        }
      }
      pushIncomingMessage(data);
    };

    // Register the listener
    receiveMessage('message', handleMessage);

    axios.get(`project/get-project/${projectId}`)
      .then((response) => {
        setProject(response.data.project);
      })
      .catch((error) => {
        console.error("Error fetching project:", error);
      });

    axios
      .get("/user/all-users")
      .then((response) => {
        setUsers(response.data.users || response.data || []);
      })
      .catch((error) => {
        console.error("Error fetching users:", error);
        setUsers([]);
      });

    // Cleanup function to remove event listener and disconnect socket when component unmounts
    return () => {
      if (socket) {
        socket.off('message', handleMessage);
        disconnectSocket();
      }
    };
  }, [user]);

  const handleTerminalSubmit = async (e) => {
    if (e) e.preventDefault();
    
    if (!terminalCommand.trim()) return;
    
    if (!terminalWriterRef.current) {
      setTerminalOutput((prev) => `${prev}\n[Error: Terminal not ready. Please wait...]\n`);
      return;
    }

    try {
      // Echo the command in the terminal view
      setTerminalOutput((prev) => `${prev}$ ${terminalCommand}\n`);
      
      // Write command as Uint8Array for proper encoding
      const encoder = new TextEncoder();
      const commandBytes = encoder.encode(`${terminalCommand}\n`);
      await terminalWriterRef.current.write(commandBytes);
      
      setTerminalCommand("");
    } catch (err) {
      console.error("Failed to write to terminal", err);
      setTerminalOutput((prev) => `${prev}\n[write error] ${err.message || String(err)}\n`);
    }
  };

  const handleTerminalKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTerminalSubmit();
    }
  };

  // Save files to WebContainer and run the code
  const runCode = async () => {
    if (!webContainer || !currentFile) {
      alert("Please wait for WebContainer to be ready and select a file to run.");
      return;
    }

    // Prevent multiple simultaneous runs
    if (isRunning || runProcessRef.current) {
      return;
    }

    setIsRunning(true);
    setIsTerminalOpen(true); // Open terminal when running
    runProcessRef.current = true;

    try {
      // Save all files from fileTree to WebContainer using filesystem API
      for (const fileName of Object.keys(fileTree)) {
        const fileContent = fileTree[fileName].file?.contents || fileTree[fileName].content || "";
        try {
          // Write file to WebContainer filesystem
          await webContainer.fs.writeFile(fileName, fileContent);
        } catch (err) {
          setTerminalOutput((prev) => `${prev}\n[Error saving ${fileName}: ${err.message}]\n`);
        }
      }

      // Verify file exists before running
      try {
        await webContainer.fs.readFile(currentFile, 'utf-8');
      } catch (err) {
        setTerminalOutput((prev) => `${prev}\n[Error: File ${currentFile} not found in WebContainer]\n`);
        setIsRunning(false);
        return;
      }

      // Determine command based on file extension
      const getRunCommand = (fileName) => {
        const ext = fileName.split(".").pop().toLowerCase();

        switch (ext) {
          case "js":
            return ["node", fileName];
          case "ts":
            return ["npx", "ts-node", fileName];
          case "py":
            return ["python3", fileName];
          case "html":
            return ["python3", "-m", "http.server", "8000"];
          case "json":
            return ["cat", fileName];
          case "md":
            return ["cat", fileName];
          case "txt":
            return ["cat", fileName];
          default:
            // Check if package.json exists, run npm start
            if (fileTree["package.json"]) {
              return ["npm", "start"];
            }
            return ["node", fileName]; // Default to node
        }
      };

      const commandParts = getRunCommand(currentFile);
      const commandString = commandParts.join(" ");
      
      // Show command in terminal (only once)
      setTerminalOutput((prev) => {
        // Prevent duplicate commands
        if (prev.endsWith(`$ ${commandString}\n`)) {
          return prev;
        }
        return `${prev}\n$ ${commandString}\n`;
      });
      
      // Scroll terminal to bottom
      setTimeout(() => {
        if (terminalOutputRef.current) {
          terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
        }
      }, 0);
      
      // Wait a bit to ensure files are written
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Spawn a new process to execute the command
      const proc = await webContainer.spawn(commandParts[0], commandParts.slice(1));
      
      // Read output from stdout
      const stdoutReader = proc.output.getReader();
      const decoder = new TextDecoder();
      let hasOutput = false;
      
      // Helper function to strip ANSI color codes
      const stripAnsi = (str) => {
        return str.replace(/\x1b\[[0-9;]*m/g, '');
      };

      const readStdout = async () => {
        try {
          while (true) {
            const { value, done } = await stdoutReader.read();
            if (done) {
              break;
            }
            if (value != null) {
              hasOutput = true;

              // WebContainer should give Uint8Array, but be defensive
              let text;
              if (value instanceof Uint8Array) {
                text = decoder.decode(value, { stream: true });
              } else if (typeof value === "string") {
                text = value;
              } else {
                text = String(value);
              }

              // Strip ANSI color codes
              const cleanText = stripAnsi(text);
              
              setTerminalOutput((prev) => {
                const newOutput = prev + cleanText;
                // Auto-scroll to bottom
                setTimeout(() => {
                  if (terminalOutputRef.current) {
                    terminalOutputRef.current.scrollTop = terminalOutputRef.current.scrollHeight;
                  }
                }, 0);
                return newOutput;
              });
            }
          }
        } catch (err) {
          console.error("Failed to read stdout:", err);
          setTerminalOutput((prev) => `${prev}\n[Error reading stdout: ${err.message}]\n`);
        }
      };
      
      // Start reading output and wait for it to complete
      await readStdout();
      
      // Wait for process to exit
      try {
        const exitCode = await proc.exit;
        
        if (!hasOutput) {
          if (exitCode !== 0) {
            setTerminalOutput((prev) => `${prev}\n[Process exited with code ${exitCode} - check for errors above]\n`);
          } else {
            setTerminalOutput((prev) => `${prev}\n[Process completed successfully - no output]\n`);
          }
        } else if (exitCode !== 0) {
          setTerminalOutput((prev) => `${prev}\n[Process exited with code ${exitCode}]\n`);
        }
      } catch (err) {
        setTerminalOutput((prev) => `${prev}\n[Error: ${err.message}]\n`);
      } finally {
        setIsRunning(false);
        runProcessRef.current = null;
      }
      
    } catch (err) {
      setTerminalOutput((prev) => `${prev}\n[Run error] ${err.message || String(err)}\n`);
      setIsRunning(false);
      runProcessRef.current = null;
    }
  };

   const send = ()=>{
      if (!messageInput.trim()) return;
      if (!user || !user._id) {
        console.error("User not loaded");
        return;
      }
      
      const messageData = {
        message: messageInput,
        sender: user._id,
        senderEmail: user.email,
        aiProvider: aiProvider,
      };
       
  sendMessage('message', messageData);

  pushOutgoingMessage(messageData);

      setMessageInput("");
    }

    const handleChatKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    }

    // Detect language based on file extension
    const getLanguageFromFileName = (fileName) => {
      if (!fileName) return 'plaintext';
      const ext = fileName.split('.').pop().toLowerCase();
      const languageMap = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'py': 'python',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'md': 'markdown',
        'txt': 'plaintext',
        'yaml': 'yaml',
        'yml': 'yaml',
        'xml': 'xml',
        'sh': 'shell',
        'bash': 'shell',
      };
      return languageMap[ext] || 'plaintext';
    }
    
  const addCollaborators = async () => {
    if (selectedUserIds.length === 0) {
      setAddCollaboratorsError("Please select at least one user");
      return;
    }

    const projectId = Location.state?.project?._id || Location.state?.projectId;
    
    if (!projectId) {
      setAddCollaboratorsError("Project ID is missing. Please reload the page.");
      return;
    }

    setIsAddingCollaborators(true);
    setAddCollaboratorsError(null);

    try {
      await axios.put("/project/add-user", {
        projectId: projectId,
        users: selectedUserIds,
      });
      
      setIsUsersModalOpen(false);
      setSelectedUserIds([]);
      setAddCollaboratorsError(null);
    } catch (error) {
      const errorMessage = 
        error.response?.data?.error || 
        error.response?.data?.message ||
        (error.response?.data?.errors ? 
          error.response.data.errors.map(e => e.msg || e.message).join(", ") : 
          error.message) ||
        "Failed to add collaborators";
      setAddCollaboratorsError(errorMessage);
    } finally {
      setIsAddingCollaborators(false);
    }
  };

  // Toggle user selection
  const toggleUserSelection = (userId) => {
    setSelectedUserIds((prev) => {
      if (prev.includes(userId)) {
        // Remove if already selected (unselect)
        return prev.filter((id) => id !== userId);
      } else {
        // Add if not selected
        return [...prev, userId];
      }
    });
  };

  // Show loading state if user is not loaded
  if (!user || !user._id) {
    return (
      <main className="h-screen w-screen flex items-center justify-center bg-gray-900">
        <div className="text-white text-lg">Loading user...</div>
      </main>
    );
  }

  return (
    <main className="h-screen w-screen flex relative overflow-hidden">
      {/* Connection Status Indicator */}
      <div className={`fixed top-2 left-2 z-50 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 transition-all ${
        isSocketConnected 
          ? 'bg-green-500 text-white' 
          : 'bg-red-500 text-white animate-pulse'
      }`}>
        <span className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-white' : 'bg-white'}`}></span>
        {isSocketConnected ? 'Connected' : 'Reconnecting...'}
      </div>

      <section className="left flex flex-col h-full w-96 min-w-96 max-w-96 bg-slate-300">
        <header className="flex-shrink-0 flex justify-between items-center p-2 px-4 w-full bg-slate-100">
          <button
            onClick={() => setIsUsersModalOpen(true)}
            className="flex gap-2 items-center text-black text-sm hover:bg-slate-200 px-3 py-2 rounded-md transition cursor-pointer"
          >
            <i className="ri-add-line mr-1"></i>
            <p>Add Collaborators</p>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 font-medium">AI Model:</label>
              <select 
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value)}
                className="px-2 py-1 rounded border border-gray-300 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
              >
                <option value="gemini">Gemini</option>
                <option value="huggingface">Hugging Face</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>

            <button
              className="p-2 cursor-pointer hover:bg-slate-200 rounded-md transition"
              onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
            >
              <i className="ri-group-fill text-black"></i>
            </button>
          </div>
        </header>

        <div className="conversation-area flex-1 flex flex-col relative overflow-hidden">
          <div className="message-box p-2 flex-1 flex flex-col gap-1 overflow-y-auto" ref={messageRef}>
            {messages.map((m, idx) => {
              const isIncoming = m.incoming !== false;
              const isAi = m.sender === 'ai-bot' || m.sender?._id === 'ai-bot';
              return (
                <div
                  key={idx}
                  className={`text-black p-2 bg-white flex flex-col w-fit rounded-md max-w-56 ${!isIncoming ? 'ml-auto' : ''}`}
                >
                  <small className="opacity-65 text-xs">{m.senderEmail || m.sender?.email || 'Unknown'}</small>
                  <div className="text-sm overflow-auto bg-slate-900 text-white">
                    {isAi ? <Markdown>{m.message}</Markdown> : <span>{m.message}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="inputField w-full flex flex-shrink-0 border-t border-slate-400">
            <input
              type="text"
              name=""
              value={messageInput}
              onChange={(e)=> setMessageInput(e.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder="Enter Message"
              className="p-3 px-5 border-none outline-none bg-white text-black flex-1"
            />

            <button className="cursor-pointer bg-black px-4 hover:bg-gray-800 transition" onClick={send}>
              <i className="ri-send-plane-fill text-white"></i>
            </button>
          </div>
        </div>
      </section>

      {/* Side Panel */}
      <div
        className={`sidePanel w-64 h-full bg-slate-200 fixed right-0 top-0 transform transition-transform duration-300 ease-in-out shadow-lg ${
          isSidePanelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between p-4 bg-slate-100 border-b">
          <h2 className="text-lg font-semibold text-black">Team Members</h2>
          <button
            onClick={() => setIsSidePanelOpen(false)}
            className="text-black"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </header>
        <div className="p-4">
          <div className="users flex flex-col gap-2">
            {project && project.users && project.users.map((user, index) => (
              <div key={index} className="user flex gap-2 items-center cursor-pointer hover:bg-slate-300 p-2 rounded">
                <div className="aspect-square rounded-full w-10 h-10 flex items-center justify-center bg-slate-700 relative">
                  <i className="ri-user-fill text-white"></i>
                </div>
                <h1 className="font-semibold text-black text-lg">{user.email || 'User'}</h1>
              </div>
            ))}
            {(!project || !project.users || project.users.length === 0) && (
              <p className="text-sm text-gray-600">No team members yet</p>
            )}
          </div>
        </div>
      </div>

 <section className="right bg-red-50 flex-1 h-full flex overflow-hidden">
  {/* Left Explorer Section */}
  <div className="explorer h-full w-52 min-w-52 max-w-64 bg-slate-200 overflow-y-auto flex-shrink-0">
    <div className="file-tree w-full">
      {Object.keys(fileTree).map((fileName) => (
        <button
          type="button"
          key={fileName}
          className="tree-element p-2 px-4 flex items-center gap-2 bg-slate-100 w-full cursor-pointer hover:bg-slate-300"
          onClick={() => {
            setCurrentFile(fileName);
            setOpenFiles((prev) => {
              if (prev.includes(fileName)) return prev;
              return [...prev, fileName];
            });
          }}
        >
          <p className="cursor-pointer font-semibold text-lg text-black">
            {fileName}
          </p>
        </button>
      ))}
    </div>
  </div>

  {/* Right Editor + Terminal Section */}
  <div className="flex flex-col flex-1 overflow-hidden">
    {/* Open Files Tabs */}
    <div className="open-files flex-shrink-0 flex gap-2 p-2 bg-slate-100 border-b border-slate-300 text-black items-center">
      <div className="flex gap-2 flex-1">
        {openFiles.map((fileName) => (
          <button
            type="button"
            key={fileName}
            onClick={() => setCurrentFile(fileName)}
            className={`open-file cursor-pointer px-4 py-1 font-semibold text-lg rounded ${
              currentFile === fileName ? "bg-white" : "bg-slate-200"
            }`}
          >
            {fileName}
          </button>
        ))}
      </div>
      {currentFile && (
        <button
          onClick={() => {
            // Extra guard against double-clicks
            if (!isRunning && !runProcessRef.current) {
              runCode();
            }
          }}
          disabled={!isTerminalReady || isRunning}
          className="px-4 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded flex items-center gap-2 transition"
        >
          <i className="ri-play-fill"></i>
          {isRunning ? "Running..." : "Run"}
        </button>
      )}
    </div>

    {/* Editor + Terminal Area */}
    <div className="bottom flex-1 text-black p-2 flex flex-col gap-2 overflow-hidden">
      {/* Monaco Code editor */}
      <div className="flex-1 min-h-0 border border-gray-300 rounded overflow-hidden">
        {fileTree[currentFile] ? (
          <Editor
            height="100%"
            language={getLanguageFromFileName(currentFile)}
            value={fileTree[currentFile].file?.contents || fileTree[currentFile].content || ""}
            theme="vs-dark"
            onChange={async (newContent) => {
              if (newContent === undefined) return;
              
              setFileTree((prev) => ({
                ...prev,
                [currentFile]: {
                  file: {
                    contents: newContent,
                  },
                },
              }));
              
              // Auto-save to WebContainer when editing
              if (webContainer && currentFile) {
                try {
                  await webContainer.fs.writeFile(currentFile, newContent);
                } catch (err) {
                  console.error("Failed to save file:", err);
                }
              }
            }}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-400">
            <p>Select a file to edit</p>
          </div>
        )}
      </div>

      {/* WebContainer-backed terminal */}
      <div className={`flex-shrink-0 flex flex-col border border-gray-300 rounded bg-black text-green-200 transition-all ${
        isTerminalOpen ? "h-64" : "h-8"
      }`}>
        <div 
          className="px-3 py-1 text-xs bg-gray-900 text-gray-200 border-b border-gray-700 flex justify-between items-center cursor-pointer"
          onClick={() => setIsTerminalOpen(!isTerminalOpen)}
        >
          <span>WebContainer Terminal</span>
          <div className="flex items-center gap-2">
            <span className="opacity-60 text-[10px]">
              {!isTerminalReady 
                ? "starting..." 
                : isRunning 
                ? "running..." 
                : "ready"}
            </span>
            <i className={`ri-${isTerminalOpen ? "arrow-down-s" : "arrow-up-s"}-line text-xs`}></i>
          </div>
        </div>
        {isTerminalOpen && (
          <>
            <div 
              ref={terminalOutputRef}
              className="flex-1 overflow-auto px-3 py-2 font-mono text-xs whitespace-pre-wrap min-h-0"
            >
              {terminalOutput || "Starting shell..."}
            </div>
            <form onSubmit={handleTerminalSubmit} className="flex items-center border-t border-gray-700">
              <span className="px-2 text-xs text-gray-400">$</span>
              <input
                type="text"
                className="flex-1 bg-transparent text-green-200 text-xs px-1 py-2 outline-none disabled:opacity-50"
                placeholder={
                  !isTerminalReady 
                    ? "Waiting for shell..." 
                    : isRunning 
                    ? "Process running..." 
                    : "Type a command and press Enter"
                }
                value={terminalCommand}
                onChange={(e) => setTerminalCommand(e.target.value)}
                onKeyDown={handleTerminalKeyDown}
                disabled={!isTerminalReady || isRunning}
              />
              <button
                type="submit"
                disabled={!isTerminalReady || isRunning}
                className="px-3 py-1 text-xs bg-gray-800 text-gray-100 disabled:opacity-40"
              >
                Execute
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  </div>
</section>


      {/* Users Modal */}
      {isUsersModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-40"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg overflow-hidden">
            <header className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-800">
                Select Users
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 hidden sm:block">
                  Selected:{" "}
                  <strong className="text-gray-800">
                    {selectedUserIds.length} user
                    {selectedUserIds.length !== 1 ? "s" : ""}
                  </strong>
                </span>
                <button
                  onClick={() => setIsUsersModalOpen(false)}
                  className="p-2 rounded hover:bg-gray-100"
                  aria-label="Close users modal"
                >
                  <svg
                    className="w-5 h-5 text-gray-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </header>

            <main className="p-4">
              <div className="mb-3">
                <input
                  type="text"
                  placeholder="Search users..."
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black"
                  onChange={(e) => {
                    const q = e.target.value.toLowerCase().trim();
                    // simple local filter -- optional: could lift to state for performance
                    // Filter visually by manipulating a CSS class via data attribute
                    document
                      .querySelectorAll("[data-user-item]")
                      .forEach((el) => {
                        const name = el
                          .getAttribute("data-user-name")
                          .toLowerCase();
                        const email = el
                          .getAttribute("data-user-email")
                          .toLowerCase();
                        el.style.display =
                          name.includes(q) || email.includes(q) ? "" : "none";
                      });
                  }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-auto pr-2">
                {Array.isArray(users) && users.length > 0 ? (
                  users.map((user) => {
                    const isSelected = selectedUserIds.includes(user._id);
                    return (
                      <button
                        key={user._id}
                        data-user-item
                        data-user-name={user.email}
                        data-user-email={user.email}
                        onClick={() => toggleUserSelection(user._id)}
                        className={`flex items-center gap-3 w-full text-left p-3 rounded-lg border transition
                        ${
                          isSelected
                            ? "bg-indigo-50 border-indigo-300 ring-2 ring-indigo-200"
                            : "bg-white hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex-none w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-medium">
                          {user.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-gray-800">
                              {user.email}
                            </h4>
                            {isSelected && (
                              <svg
                                className="w-5 h-5 text-indigo-600"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">{user.email}</p>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-full text-center text-gray-500 py-8">
                    No users available
                  </div>
                )}
              </div>
            </main>

            {addCollaboratorsError && (
              <div className="mx-4 mb-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{addCollaboratorsError}</p>
              </div>
            )}

            <footer className="flex items-center justify-between p-4 border-t">
              <div className="text-sm text-gray-600">
                Selected IDs:{" "}
                <span className="font-medium text-gray-800">
                  {selectedUserIds.length > 0 ? selectedUserIds.length : "None"}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedUserIds([]);
                    setAddCollaboratorsError(null);
                  }}
                  className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 text-sm text-black disabled:opacity-50"
                  disabled={isAddingCollaborators}
                >
                  Clear All
                </button>
                <button
                  onClick={addCollaborators}
                  disabled={isAddingCollaborators || selectedUserIds.length === 0}
                  className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isAddingCollaborators ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Adding...
                    </>
                  ) : (
                    <>
                      Add{" "}
                      {selectedUserIds.length > 0
                        ? `(${selectedUserIds.length})`
                        : ""}
                    </>
                  )}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
};

export default Project;
