import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import axios from "../config/axios";
import { initializeSocket, receiveMessage, sendMessage, disconnectSocket } from "../config/socket";
import { useAppContext } from "../context/context";
import Markdown from 'markdown-to-jsx'
import { getWebContainerInstance } from "../config/webContainer";

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
  const { user } = useAppContext();
  const messageRef = useRef();
  const [fileTree, setFileTree] = useState({
    // "app.js": { file: { contents: "// Welcome to Devin AI!\nconsole.log('Hello, Devin AI!');\n" } },
  });

  const [currentFile, setCurrentFile] = useState(null);

  const [openFiles, setOpenFiles] = useState([]);

  // messages state replaces DOM innerHTML manipulation
  const [messages, setMessages] = useState([]);

  const [webContainer, setWebContainer] = useState(null);
  
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

  useEffect(() => {
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
        console.log("container Started");
        
      })
    }

    
    const handleMessage = (data) => {
      
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
        console.log("FileTree received:", fileTreeData);
        webContainer?.mount(message.fileTree || {});
        setFileTree(fileTreeData || {});
        
        if (!currentFile && Object.keys(fileTreeData).length > 0) {
          const firstFileName = Object.keys(fileTreeData)[0];
          console.log("Opening first file:", firstFileName);
          setCurrentFile(firstFileName);
          setOpenFiles([firstFileName]);
        }
      } else {
        console.log("No fileTree found in message or data");
      }
      pushIncomingMessage(data);
    };

    // Register the listener
    receiveMessage('message', handleMessage);

    axios.get(`project/get-project/${projectId}`)
      .then((response) => {
        console.log("Project response:", response.data);
        console.log("Project users:", response.data.project?.users);
        setProject(response.data.project);
      })
      .catch((error) => {
        console.error("Error fetching project:", error);
      });

    axios
      .get("/user/all-users")
      .then((response) => {
        console.log("Users response:", response.data);
        // Handle both response formats: {users: [...]} or direct array
        setUsers(response.data.users || response.data || []);
      })
      .catch((error) => {
        console.error("Error fetching users:", error);
        setUsers([]); // Ensure users is always an array
      });

    // Cleanup function to remove event listener and disconnect socket when component unmounts
    return () => {
      if (socket) {
        socket.off('message', handleMessage);
        disconnectSocket();
      }
    };
  }, []);

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
    
  const addCollaborators = async () => {
    if (selectedUserIds.length === 0) {
      setAddCollaboratorsError("Please select at least one user");
      return;
    }

    // Check projectId from location state
    const projectId = Location.state?.project?._id || Location.state?.projectId;
    
    if (!projectId) {
      setAddCollaboratorsError("Project ID is missing. Please reload the page.");
      console.error("Location.state:", Location.state);
      return;
    }

    setIsAddingCollaborators(true);
    setAddCollaboratorsError(null);

    try {
      console.log("Sending add-user request:", {
        projectId: projectId,
        users: selectedUserIds,
      });

      const response = await axios.put("/project/add-user", {
        projectId: projectId,
        users: selectedUserIds,
      });
      
      console.log("Add collaborators response:", response.data);
      
      // Success - close modal and reset
      setIsUsersModalOpen(false);
      setSelectedUserIds([]);
      setAddCollaboratorsError(null);
      
      // Optional: Show success message or refresh project data
    } catch (error) {
      console.error("Error adding collaborators:", error);
      console.error("Error response data:", error.response?.data);
      
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

  console.log("Project location:", Location.state);

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

  return (
    <main className="h-screen w-screen flex relative">
      {/* Connection Status Indicator */}
      <div className={`fixed top-2 right-2 z-50 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 transition-all ${
        isSocketConnected 
          ? 'bg-green-500 text-white' 
          : 'bg-red-500 text-white animate-pulse'
      }`}>
        <span className={`w-2 h-2 rounded-full ${isSocketConnected ? 'bg-white' : 'bg-white'}`}></span>
        {isSocketConnected ? 'Connected' : 'Reconnecting...'}
      </div>

      <section className="left flex flex-col h-full min-w-96 bg-slate-300">
        <header className="flex justify-between items-center p-2 px-4 w-full bg-slate-100">
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

        <div className="conversation-area pt-14 pb-10 flex-grow flex flex-col h-screen relative">
          <div className="message-box p-1 flex-grow flex flex-col gap-1 overflow-auto max-h-full scrollbar-hide" ref={messageRef}>
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

          <div className="inputField w-full flex absolute bottom-0">
            <input
              type="text"
              name=""
              value={messageInput}
              onChange={(e)=> setMessageInput(e.target.value)}
              placeholder="Enter Message"
              className="p-3 px-5 border-none outline-none bg-white text-black grow"
            />

            <button className="cursor-pointer bg-black px-3" onClick={send}>
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

 <section className="right bg-red-50 flex-grow h-full flex">
  {/* Left Explorer Section */}
  <div className="explorer h-full max-w-64 bg-slate-200 min-w-52">
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

  {/* Right Editor Section */}
  <div className="flex flex-col flex-grow">
    {/* Open Files Tabs */}
    <div className="open-files flex gap-2 p-2 bg-slate-100 border-b border-slate-300 text-black">
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

    {/* Editor Area */}
    <div className="bottom flex-grow text-black p-2">
      {fileTree[currentFile] && (
        <textarea
          className="w-full h-full p-2 border border-gray-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={fileTree[currentFile].file?.contents || fileTree[currentFile].content || ''}
          onChange={(e) => {
            const newContent = e.target.value;
            setFileTree((prev) => ({
              ...prev,
              [currentFile]: { 
                file: {
                  contents: newContent
                }
              },
            }));
          }}
        ></textarea>
      )}
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
