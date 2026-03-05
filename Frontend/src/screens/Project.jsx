import React, { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import axios from "../config/axios";
import { initializeSocket, receiveMessage, sendMessage, disconnectSocket } from "../config/socket";
import { useAppContext } from "../context/context";
import { deleteCookie } from "../utils/cookies";
import Markdown from 'markdown-to-jsx'
import { getWebContainerInstance } from "../config/webContainer";
import Editor from '@monaco-editor/react';

const Project = () => {
  const Location = useLocation();
  const { projectId } = useParams();
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [project,setProject] = useState(Location.state?.project || null);
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
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

  // Refs to always hold the latest values inside stale closures
  const fileTreeRef = useRef({});
  const webContainerRef = useRef(null);
  const currentFileRef = useRef(null);

  // Socket connection status
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [socketError, setSocketError] = useState(null);
  const socketRef = useRef(null);
  
  // AI Provider selection
  const [aiProvider, setAiProvider] = useState('gemini');

  // File / Folder creation
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [creatingInsideFolder, setCreatingInsideFolder] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  const navigate = useNavigate();

  // Keep refs in sync so stale closures always read the latest value
  useEffect(() => { fileTreeRef.current = fileTree; }, [fileTree]);
  useEffect(() => { webContainerRef.current = webContainer; }, [webContainer]);
  useEffect(() => { currentFileRef.current = currentFile; }, [currentFile]);

  // auto-scroll when messages change
  useEffect(() => {
    const box = messageRef.current;
    if (box) {
      box.scrollTop = box.scrollHeight;
    }
  }, [messages]);

  const saveTimerRef = useRef(null);

  // Save fileTree — localStorage (instant) + backend (persistent)
  const saveFileTree = useCallback((updatedFileTree) => {
    if (!projectId || !updatedFileTree || Object.keys(updatedFileTree).length === 0) return;

    // 1. Save to localStorage immediately — survives refresh even if backend fails
    try {
      localStorage.setItem(`fileTree_${projectId}`, JSON.stringify(updatedFileTree));
    } catch (e) {
      console.error('localStorage save failed:', e);
    }

    // 2. Save to backend via REST API (debounced)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      axios.put('/project/update-file-tree', {
        projectId,
        fileTree: updatedFileTree,
      })
        .then(() => console.log('[FileTree] Saved to DB ✓'))
        .catch((err) => console.error('[FileTree] DB save failed:', err.message));
    }, 1000);

    // 3. Broadcast to teammates via socket
    sendMessage('update-file-tree', { fileTree: updatedFileTree });
  }, [projectId]);

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

    if (!projectId) {
      console.error("No project ID found in URL params");
      setSocketError("Project ID not found");
      return;
    }

    let socket;
    try {
      socket = initializeSocket(projectId);
      socketRef.current = socket;

      // Track connection status
      socket.on('connect', () => {
        setIsSocketConnected(true);
        setSocketError(null);
      });

      socket.on('disconnect', () => {
        setIsSocketConnected(false);
      });

      socket.on('reconnect', () => {
        setIsSocketConnected(true);
        setSocketError(null);
      });

      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        setSocketError('Failed to connect to server');
        setIsSocketConnected(false);
      });

      socket.on('error', (error) => {
        console.error('Socket error:', error);
        setSocketError('Connection error occurred');
      });
    } catch (error) {
      console.error('Failed to initialize socket:', error);
      setSocketError('Failed to initialize connection');
    }

    if(!webContainer){
      getWebContainerInstance()
        .then((instance)=>{
          setWebContainer(instance);
        })
        .catch((error) => {
          console.error('Failed to initialize WebContainer:', error);
        });
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
      
      if (fileTreeData) {
        // Mount new files into WebContainer using the up-to-date ref
        if (webContainerRef.current) {
          try {
            await webContainerRef.current.mount(fileTreeData);
          } catch (err) {
            console.error("Failed to mount files to WebContainer:", err);
          }
        }

        // Use functional updater — React always passes the LATEST state as `prev`
        // This is the safest way to merge regardless of stale closures
        let mergedTree;
        setFileTree(prev => {
          mergedTree = { ...prev, ...fileTreeData };
          return mergedTree;
        });

        // Open the first AI file if nothing is open yet
        if (!currentFileRef.current && Object.keys(fileTreeData).length > 0) {
          const firstFileName = Object.keys(fileTreeData)[0];
          setCurrentFile(firstFileName);
          setOpenFiles((prev) =>
            prev.includes(firstFileName) ? prev : [...prev, firstFileName]
          );
        }

        // Save after a tick so mergedTree is populated from the updater above
        setTimeout(() => {
          if (mergedTree) saveFileTree(mergedTree);
        }, 0);
      }
      pushIncomingMessage(data);
    };

    // Register the listener
    receiveMessage('message', handleMessage);

    // Listen for fileTree updates from teammates — merge, don't replace
    receiveMessage('file-tree-update', (data) => {
      if (data.fileTree) {
        const mergedTree = { ...fileTreeRef.current, ...data.fileTree };
        setFileTree(mergedTree);
        if (webContainerRef.current) {
          webContainerRef.current.mount(data.fileTree).catch((err) =>
            console.error("Failed to mount teammate's fileTree:", err)
          );
        }
      }
    });

    // --- Restore fileTree from localStorage IMMEDIATELY (no network wait) ---
    try {
      const localData = localStorage.getItem(`fileTree_${projectId}`);
      if (localData) {
        const localTree = JSON.parse(localData);
        if (localTree && Object.keys(localTree).length > 0) {
          console.log('[FileTree] Restored from localStorage ✓', Object.keys(localTree));
          setFileTree(localTree);
          const firstFile = Object.keys(localTree)[0];
          setCurrentFile(firstFile);
          setOpenFiles([firstFile]);
        }
      }
    } catch (e) {
      console.error('[FileTree] localStorage load failed:', e);
    }

    // --- Also fetch from database to get latest version ---
    axios.get(`project/get-project/${projectId}`)
      .then((response) => {
        const proj = response.data.project;
        setProject(proj);

        console.log('[FileTree] DB returned fileTree:', proj.fileTree ? 'yes' : 'empty');

        let dbFileTree = null;
        try {
          if (proj.fileTree) {
            dbFileTree = typeof proj.fileTree === 'string'
              ? JSON.parse(proj.fileTree)
              : proj.fileTree;
          }
        } catch (e) {
          console.error('[FileTree] DB parse failed:', e);
        }

        // Merge DB version with any files already in state (e.g. created while DB was loading)
        if (dbFileTree && Object.keys(dbFileTree).length > 0) {
          console.log('[FileTree] Merging DB version ✓', Object.keys(dbFileTree));
          setFileTree(prev => {
            const merged = { ...prev, ...dbFileTree };
            // Sync localStorage with the final merged tree
            try {
              localStorage.setItem(`fileTree_${projectId}`, JSON.stringify(merged));
            } catch (_) {}
            return merged;
          });
          setCurrentFile(prev => prev || Object.keys(dbFileTree)[0]);
          setOpenFiles(prev => {
            const firstFile = Object.keys(dbFileTree)[0];
            return prev.length > 0 ? prev : [firstFile];
          });
        }
      })
      .catch((error) => {
        console.error('[FileTree] DB fetch error:', error.message);
      });

    axios
      .get("/user/all-users")
      .then((response) => {
        const allUsers = response.data.users || response.data || [];
        setUsers(allUsers);
        setFilteredUsers(allUsers);
      })
      .catch((error) => {
        console.error("Error fetching users:", error);
        setUsers([]);
        setFilteredUsers([]);
      });

    // Cleanup function to remove event listener and disconnect socket when component unmounts
    return () => {
      if (socket) {
        socket.off('message', handleMessage);
        socket.off('connect');
        socket.off('disconnect');
        socket.off('reconnect');
        socket.off('connect_error');
        socket.off('error');
        disconnectSocket();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const handleLogout = async () => {
      try {
        await axios.get("/user/logout").catch(() => {});
      } catch (error) {
        console.error("Logout error:", error);
      } finally {
        setUser(null);
        deleteCookie("token");
        delete window.__appToken;
        navigate("/login");
      }
    };
    
  const addCollaborators = async () => {
    if (selectedUserIds.length === 0) {
      setAddCollaboratorsError("Please select at least one user");
      return;
    }

    if (!projectId) {
      setAddCollaboratorsError("Project ID is missing. Please reload the page.");
      return;
    }

    setIsAddingCollaborators(true);
    setAddCollaboratorsError(null);

    try {
      const response = await axios.put("/project/add-user", {
        projectId: projectId,
        users: selectedUserIds,
      });
      
      // Refresh project data to show new collaborators
      const updatedProject = await axios.get(`project/get-project/${projectId}`);
      setProject(updatedProject.data.project);
      
      setIsUsersModalOpen(false);
      setSelectedUserIds([]);
      setAddCollaboratorsError(null);
      setUserSearchQuery("");
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

  // Filter users based on search query
  useEffect(() => {
    if (!userSearchQuery.trim()) {
      setFilteredUsers(users);
    } else {
      const query = userSearchQuery.toLowerCase().trim();
      const filtered = users.filter((user) => {
        const email = user.email?.toLowerCase() || '';
        return email.includes(query);
      });
      setFilteredUsers(filtered);
    }
  }, [userSearchQuery, users]);

  const confirmNewItem = () => {
    const name = newItemName.trim();
    if (!name) return;

    const fullPath = creatingInsideFolder ? `${creatingInsideFolder}/${name}` : name;

    if (fileTree[fullPath]) {
      alert(`"${fullPath}" already exists.`);
      return;
    }

    let updatedTree;
    if (isCreatingFile) {
      updatedTree = { ...fileTree, [fullPath]: { file: { contents: "" } } };
      setFileTree(updatedTree);
      setCurrentFile(fullPath);
      setOpenFiles((prev) => (prev.includes(fullPath) ? prev : [...prev, fullPath]));
      // Auto-expand the parent folder
      if (creatingInsideFolder) {
        setExpandedFolders(prev => new Set([...prev, creatingInsideFolder]));
      }
      // Create file in WebContainer
      if (webContainerRef.current) {
        if (creatingInsideFolder) {
          webContainerRef.current.fs.mkdir(creatingInsideFolder, { recursive: true }).catch(() => {});
        }
        webContainerRef.current.fs.writeFile(fullPath, "").catch(() => {});
      }
    } else {
      updatedTree = { ...fileTree, [name]: { directory: {} } };
      setFileTree(updatedTree);
      setExpandedFolders(prev => new Set([...prev, name]));
      // Create directory in WebContainer
      if (webContainerRef.current) {
        webContainerRef.current.fs.mkdir(name, { recursive: true }).catch(() => {});
      }
    }

    saveFileTree(updatedTree);
    setIsCreatingFile(false);
    setIsCreatingFolder(false);
    setCreatingInsideFolder(null);
    setNewItemName("");
  };

  const downloadCurrentFile = () => {
    if (!currentFile || !fileTree[currentFile]) return;
    const content = fileTree[currentFile].file?.contents || fileTree[currentFile].content || "";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
      <div className={`fixed top-2 left-2 z-50 px-3 py-1.5 rounded-full text-[11px] font-medium flex items-center gap-2 transition-all duration-300 ${
        isSocketConnected 
          ? 'bg-neutral-900 text-neutral-400 border border-neutral-800' 
          : 'bg-neutral-900 text-red-400 border border-red-900/50 animate-pulse'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${isSocketConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
        {isSocketConnected ? 'Connected' : socketError || 'Reconnecting...'}
      </div>

      <section className="left flex flex-col h-full w-96 min-w-96 max-w-96 bg-black border-r border-neutral-800">
        {/* Header */}
        <header className="flex-shrink-0 flex justify-between items-center p-3 px-4 w-full bg-black border-b border-neutral-800">
          <button
            onClick={() => setIsUsersModalOpen(true)}
            className="flex gap-2 items-center text-neutral-400 text-sm hover:text-white hover:bg-neutral-900 px-3 py-2 rounded-lg transition-all duration-200 cursor-pointer"
          >
            <i className="ri-user-add-line"></i>
            <p className="font-medium">Add Collaborators</p>
          </button>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-neutral-900 rounded-lg px-2.5 py-1.5 border border-neutral-800">
              <i className="ri-robot-2-line text-xs text-neutral-500"></i>
              <select 
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value)}
                className="bg-transparent text-xs font-medium focus:outline-none text-neutral-300 cursor-pointer"
              >
                <option value="gemini" className="bg-black">Gemini</option>
                <option value="huggingface" className="bg-black">Hugging Face</option>
                <option value="openai" className="bg-black">OpenAI</option>
              </select>
            </div>

            <button
              className="p-2 cursor-pointer hover:bg-neutral-900 rounded-lg transition-all duration-200 text-neutral-400 hover:text-white"
              onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
            >
              <i className="ri-team-fill"></i>
            </button>
          </div>
        </header>

        {/* Messages Area */}
        <div className="conversation-area flex-1 flex flex-col relative overflow-hidden bg-black">
          <div
            className="message-box p-3 flex-1 flex flex-col gap-4 overflow-y-auto"
            ref={messageRef}
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#262626 transparent' }}
          >
            {messages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 select-none">
                <i className="ri-chat-3-line text-4xl text-neutral-700"></i>
                <p className="text-sm text-neutral-600">No messages yet</p>
                <p className="text-xs text-neutral-700 text-center px-4">
                  Type <span className="text-white font-medium">@ai</span> followed by a prompt to generate code
                </p>
              </div>
            )}
            {messages.map((m, idx) => {
              const isIncoming = m.incoming !== false;
              const isAi = m.sender === 'ai-bot' || m.sender?._id === 'ai-bot';
              const senderEmail = m.senderEmail || m.sender?.email || 'Unknown';
              const initial = isAi ? 'AI' : senderEmail.charAt(0).toUpperCase();

              return (
                <div
                  key={idx}
                  className={`flex gap-2.5 max-w-[90%] ${!isIncoming ? 'ml-auto flex-row-reverse' : ''}`}
                >
                  {/* Avatar */}
                  <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                    isAi
                      ? 'bg-white text-black'
                      : !isIncoming
                      ? 'bg-neutral-700 text-white'
                      : 'bg-neutral-800 text-neutral-300'
                  }`}>
                    {isAi ? <i className="ri-robot-2-fill text-[10px]"></i> : initial}
                  </div>

                  {/* Message Bubble */}
                  <div className={`flex flex-col gap-1 ${!isIncoming ? 'items-end' : 'items-start'}`}>
                    <span className={`text-[10px] font-medium px-1 ${
                      isAi ? 'text-neutral-500' : !isIncoming ? 'text-neutral-500' : 'text-neutral-600'
                    }`}>
                      {isAi ? 'AI Assistant' : senderEmail}
                    </span>
                    <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      isAi
                        ? 'bg-neutral-900 text-neutral-200 border border-neutral-800 rounded-tl-sm'
                        : !isIncoming
                        ? 'bg-white text-black rounded-tr-sm'
                        : 'bg-neutral-900 text-neutral-300 border border-neutral-800 rounded-tl-sm'
                    }`}>
                      {isAi ? (
                        <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-black prose-pre:rounded-lg prose-pre:border prose-pre:border-neutral-800 prose-code:text-neutral-300 prose-p:my-1 prose-headings:text-white">
                          <Markdown>{m.message}</Markdown>
                        </div>
                      ) : (
                        <span className="whitespace-pre-wrap">{m.message}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input Area */}
          <div className="inputField w-full flex-shrink-0 p-3 bg-black border-t border-neutral-800">
            <div className="flex items-center gap-2 bg-neutral-900 rounded-xl border border-neutral-800 focus-within:border-neutral-600 transition-all duration-200">
              <input
                type="text"
                value={messageInput}
                onChange={(e)=> setMessageInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Type a message... ( @ai for AI )"
                className="flex-1 p-3 px-4 bg-transparent border-none outline-none text-white text-sm placeholder-neutral-600"
              />
              <button
                className="cursor-pointer m-1.5 px-4 py-2 bg-white hover:bg-neutral-200 active:scale-95 rounded-lg transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={send}
                disabled={!messageInput.trim()}
              >
                <i className="ri-send-plane-2-fill text-black text-sm"></i>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Side Panel */}
      <div
        className={`sidePanel w-72 h-full bg-black fixed right-0 top-0 transform transition-transform duration-300 ease-in-out shadow-2xl z-40 border-l border-neutral-800 ${
          isSidePanelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between p-4 bg-black border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <i className="ri-team-fill text-neutral-500"></i>
            <h2 className="text-base font-semibold text-white">Team Members</h2>
          </div>
          <button
            onClick={() => setIsSidePanelOpen(false)}
            className="text-neutral-500 hover:text-white hover:bg-neutral-900 p-1.5 rounded-lg transition-all duration-200"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </header>
        <div className="p-3">
          <div className="users flex flex-col gap-1">
            {project && project.users && project.users.map((user, index) => (
              <div key={index} className="user flex gap-3 items-center p-2.5 rounded-xl hover:bg-neutral-900 transition-all duration-200 cursor-pointer group">
                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-neutral-800 text-white text-sm font-bold border border-neutral-700">
                  {(user.email || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="font-medium text-neutral-300 text-sm truncate group-hover:text-white transition-colors">{user.email || 'User'}</h1>
                  <p className="text-[10px] text-green-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
                    Online
                  </p>
                </div>
              </div>
            ))}
            {(!project || !project.users || project.users.length === 0) && (
              <div className="flex flex-col items-center justify-center py-8">
                <i className="ri-user-line text-3xl mb-2 text-neutral-700"></i>
                <p className="text-sm text-neutral-600">No team members yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

 <section className="right bg-red-50 flex-1 h-full flex overflow-hidden">
  {/* Left Explorer Section */}
  <div className="explorer h-full w-52 min-w-52 max-w-64 bg-slate-200 overflow-y-auto flex-shrink-0 flex flex-col">
    {/* Explorer toolbar */}
    <div className="flex items-center justify-between px-3 py-2 bg-slate-300 border-b border-slate-400 flex-shrink-0">
      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Explorer</span>
      <div className="flex gap-1">
        <button
          title="New File"
          onClick={() => { setIsCreatingFile(true); setIsCreatingFolder(false); setNewItemName(""); }}
          className="p-1 hover:bg-slate-400 rounded text-slate-600 hover:text-black transition"
        >
          <i className="ri-file-add-line text-sm"></i>
        </button>
        <button
          title="New Folder"
          onClick={() => { setIsCreatingFolder(true); setIsCreatingFile(false); setNewItemName(""); }}
          className="p-1 hover:bg-slate-400 rounded text-slate-600 hover:text-black transition"
        >
          <i className="ri-folder-add-line text-sm"></i>
        </button>
      </div>
    </div>

    {/* Inline input for top-level new items (not inside a folder) */}
    {(isCreatingFile || isCreatingFolder) && !creatingInsideFolder && (
      <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-100 border-b border-slate-300 flex-shrink-0">
        <i className={`${isCreatingFile ? 'ri-file-line' : 'ri-folder-line'} text-slate-500 text-sm`}></i>
        <input
          autoFocus
          type="text"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirmNewItem();
            if (e.key === 'Escape') { setIsCreatingFile(false); setIsCreatingFolder(false); setCreatingInsideFolder(null); }
          }}
          placeholder={isCreatingFile ? "filename.js" : "folder-name"}
          className="flex-1 text-xs bg-white border border-slate-400 rounded px-1.5 py-0.5 outline-none text-black"
        />
        <button onClick={confirmNewItem} className="text-green-600 hover:text-green-800 p-0.5">
          <i className="ri-check-line text-sm"></i>
        </button>
        <button onClick={() => { setIsCreatingFile(false); setIsCreatingFolder(false); setCreatingInsideFolder(null); }} className="text-red-500 hover:text-red-700 p-0.5">
          <i className="ri-close-line text-sm"></i>
        </button>
      </div>
    )}

    <div className="file-tree w-full flex-1 overflow-y-auto">
      {(() => {
        // Group entries: collect top-level items and nest children under their parent folder
        const displayItems = {};
        Object.keys(fileTree).forEach(key => {
          const slashIdx = key.indexOf('/');
          if (slashIdx === -1) {
            if (!displayItems[key]) displayItems[key] = { entry: fileTree[key], children: [] };
            else displayItems[key].entry = fileTree[key];
          } else {
            const parent = key.substring(0, slashIdx);
            if (!displayItems[parent]) displayItems[parent] = { entry: { directory: {} }, children: [] };
            displayItems[parent].children.push(key);
          }
        });

        return Object.keys(displayItems).map(name => {
          const { entry, children } = displayItems[name];
          const isFolder = entry?.directory !== undefined;
          const isExpanded = expandedFolders.has(name);

          if (!isFolder) {
            return (
              <button
                type="button"
                key={name}
                className={`tree-element p-2 px-3 flex items-center gap-2 w-full cursor-pointer hover:bg-slate-300 transition ${
                  currentFile === name ? 'bg-slate-300' : 'bg-slate-100'
                }`}
                onClick={() => {
                  setCurrentFile(name);
                  setOpenFiles(prev => prev.includes(name) ? prev : [...prev, name]);
                }}
              >
                <i className="ri-file-line text-slate-500 text-sm flex-shrink-0"></i>
                <p className="font-semibold text-sm text-black truncate">{name}</p>
              </button>
            );
          }

          // Folder row
          return (
            <div key={name}>
              {/* Folder header */}
              <div className="flex items-center group hover:bg-slate-300 bg-slate-100 transition">
                <button
                  type="button"
                  className="flex-1 flex items-center gap-1.5 p-2 px-3 min-w-0"
                  onClick={() => setExpandedFolders(prev => {
                    const next = new Set(prev);
                    next.has(name) ? next.delete(name) : next.add(name);
                    return next;
                  })}
                >
                  <i className={`ri-arrow-${isExpanded ? 'down' : 'right'}-s-line text-slate-400 text-xs flex-shrink-0`}></i>
                  <i className={`${isExpanded ? 'ri-folder-open-fill' : 'ri-folder-fill'} text-yellow-500 text-sm flex-shrink-0`}></i>
                  <p className="font-semibold text-sm text-black truncate">{name}</p>
                </button>
                {/* Add file inside this folder */}
                <button
                  type="button"
                  title={`New file in ${name}/`}
                  className="opacity-0 group-hover:opacity-100 p-1.5 mr-1 hover:bg-slate-400 rounded text-slate-600 transition flex-shrink-0"
                  onClick={() => {
                    setIsCreatingFile(true);
                    setIsCreatingFolder(false);
                    setCreatingInsideFolder(name);
                    setNewItemName("");
                    setExpandedFolders(prev => new Set([...prev, name]));
                  }}
                >
                  <i className="ri-file-add-line text-xs"></i>
                </button>
              </div>

              {/* Inline input for creating a file inside this folder */}
              {isCreatingFile && creatingInsideFolder === name && (
                <div className="flex items-center gap-1 pl-7 pr-2 py-1.5 bg-slate-50 border-b border-slate-300">
                  <i className="ri-file-line text-slate-500 text-xs flex-shrink-0"></i>
                  <input
                    autoFocus
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmNewItem();
                      if (e.key === 'Escape') { setIsCreatingFile(false); setCreatingInsideFolder(null); }
                    }}
                    placeholder="filename.js"
                    className="flex-1 text-xs bg-white border border-slate-400 rounded px-1.5 py-0.5 outline-none text-black"
                  />
                  <button onClick={confirmNewItem} className="text-green-600 hover:text-green-800 p-0.5">
                    <i className="ri-check-line text-sm"></i>
                  </button>
                  <button onClick={() => { setIsCreatingFile(false); setCreatingInsideFolder(null); }} className="text-red-500 hover:text-red-700 p-0.5">
                    <i className="ri-close-line text-sm"></i>
                  </button>
                </div>
              )}

              {/* Files inside folder (shown when expanded) */}
              {isExpanded && children.map(filePath => (
                <button
                  type="button"
                  key={filePath}
                  className={`w-full flex items-center gap-2 pl-8 pr-3 py-2 hover:bg-slate-300 transition ${
                    currentFile === filePath ? 'bg-slate-300' : 'bg-slate-100'
                  }`}
                  onClick={() => {
                    setCurrentFile(filePath);
                    setOpenFiles(prev => prev.includes(filePath) ? prev : [...prev, filePath]);
                  }}
                >
                  <i className="ri-file-line text-slate-500 text-sm flex-shrink-0"></i>
                  <p className="font-semibold text-sm text-black truncate">{filePath.split('/').pop()}</p>
                </button>
              ))}
            </div>
          );
        });
      })()}

      {Object.keys(fileTree).length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-400">
          <i className="ri-folder-open-line text-2xl"></i>
          <p className="text-xs">No files yet</p>
        </div>
      )}
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
        <div className="flex items-center gap-2">
          <button
            onClick={downloadCurrentFile}
            title="Save file to computer"
            className="px-3 py-1 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded flex items-center gap-1.5 transition text-sm"
          >
            <i className="ri-download-line"></i>
            Save
          </button>
          <button
            onClick={() => {
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
        </div>
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
              
              const updatedTree = {
                ...fileTree,
                [currentFile]: {
                  file: {
                    contents: newContent,
                  },
                },
              };
              setFileTree(updatedTree);
              
              // Auto-save to WebContainer when editing
              if (webContainer && currentFile) {
                try {
                  await webContainer.fs.writeFile(currentFile, newContent);
                } catch (err) {
                  console.error("Failed to save file:", err);
                }
              }

              // Auto-save to database & broadcast to teammates
              saveFileTree(updatedTree);
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
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-300 text-black"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-auto pr-2">
                {Array.isArray(filteredUsers) && filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => {
                    const isSelected = selectedUserIds.includes(user._id);
                    return (
                      <button
                        key={user._id}
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
