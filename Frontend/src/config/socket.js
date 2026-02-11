import socket from 'socket.io-client';

let socketInstance = null;
let currentProjectId = null;


const getBackendURL = () => {
    const VITE_BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
    const VITE_API_URL = import.meta.env.VITE_API_URL;
    
    if (VITE_BACKEND_URL) {
        return VITE_BACKEND_URL;
    }
    if (VITE_API_URL) {
        return VITE_API_URL;
    }
    return 'http://localhost:8001';
};

export const initializeSocket = (projectId) => {
    // If socket already exists for the same project and is connected, return it
    if (socketInstance && socketInstance.connected && currentProjectId === projectId) {
        console.log('Reusing existing socket connection');
        return socketInstance;
    }

    // Disconnect existing socket if it exists
    if (socketInstance) {
        console.log('Disconnecting old socket');
        socketInstance.removeAllListeners();
        socketInstance.disconnect();
        socketInstance = null;
    }

    console.log('Creating new socket connection for project:', projectId);
    
    // Get token from memory if available
    const token = typeof window !== 'undefined' && window.__appToken;
    
    const backendURL = getBackendURL();
    console.log('Socket connecting to:', backendURL);
    
    // Create new socket connection with aggressive reconnection
    // Cookies will be sent automatically with withCredentials
    socketInstance = socket(backendURL, {
        query: {
            projectId
        },
        auth: token ? { token } : {}, // Send token in auth if available
        withCredentials: true, // Send cookies automatically
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity, // Keep trying to reconnect
        timeout: 20000,
        transports: ['websocket', 'polling'] // Try websocket first, fallback to polling
    });

    currentProjectId = projectId;

    socketInstance.on('connect', () => {
        console.log('✅ Socket connected with ID:', socketInstance.id);
    });

    socketInstance.on('disconnect', (reason) => {
        console.log('❌ Socket disconnected. Reason:', reason);
        if (reason === 'io server disconnect') {
            // Server disconnected the socket, manually reconnect
            socketInstance.connect();
        }
    });

    socketInstance.on('connect_error', (error) => {
        console.log('⚠️ Connection error:', error.message);
    });

    socketInstance.on('reconnect', (attemptNumber) => {
        console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
    });

    socketInstance.on('reconnect_attempt', (attemptNumber) => {
        console.log('🔄 Reconnection attempt:', attemptNumber);
    });

    socketInstance.on('reconnect_error', (error) => {
        console.log('⚠️ Reconnection error:', error.message);
    });

    socketInstance.on('reconnect_failed', () => {
        console.log('❌ All reconnection attempts failed');
    });

    return socketInstance;
}

export const receiveMessage = (eventName, cb) => {
    if (socketInstance) {
        // Remove any existing listeners for this event before adding new one
        socketInstance.off(eventName);
        socketInstance.on(eventName, cb);
    }
}

export const sendMessage = (eventName, data) => {
    if (socketInstance && socketInstance.connected) {
        socketInstance.emit(eventName, data);
    } else {
        console.error('Socket not connected. Cannot send message.');
    }
}

export const disconnectSocket = () => {
    if (socketInstance) {
        console.log('Manually disconnecting socket');
        socketInstance.removeAllListeners();
        socketInstance.disconnect();
        socketInstance = null;
        currentProjectId = null;
    }
}

export const getSocketInstance = () => {
    return socketInstance;
}

export const isSocketConnected = () => {
    return socketInstance && socketInstance.connected;
}