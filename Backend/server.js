import http from 'http';
import app from './app.js';
import {Server} from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Project from './models/project_model.js';
import { main } from './services/ai_service.js';

const PORT = process.env.PORT || 8001;

const server = http.createServer(app);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://ai-realtime-chat-red.vercel.app',
  'https://ai-realtime-chat-git-main-sohailshaikh7860s-projects.vercel.app',
  'http://localhost:5173',
].filter(Boolean);

const io = new Server(server,{
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

// Rate limiting for AI requests
const aiRequestLimiter = new Map();
const AI_RATE_LIMIT = {
  maxRequests: 10, // Max requests per time window
  timeWindow: 60000, // 1 minute in milliseconds
  cooldown: 5000 // 5 seconds between consecutive requests
};

const checkAiRateLimit = (userId) => {
  const now = Date.now();
  const userLimits = aiRequestLimiter.get(userId) || { requests: [], lastRequest: 0 };
  
  // Check cooldown period
  if (now - userLimits.lastRequest < AI_RATE_LIMIT.cooldown) {
    return {
      allowed: false,
      message: `Please wait ${Math.ceil((AI_RATE_LIMIT.cooldown - (now - userLimits.lastRequest)) / 1000)} seconds before sending another AI request.`
    };
  }
  
  // Remove requests outside the time window
  userLimits.requests = userLimits.requests.filter(
    timestamp => now - timestamp < AI_RATE_LIMIT.timeWindow
  );
  
  // Check if user exceeded rate limit
  if (userLimits.requests.length >= AI_RATE_LIMIT.maxRequests) {
    const oldestRequest = userLimits.requests[0];
    const timeUntilReset = Math.ceil((AI_RATE_LIMIT.timeWindow - (now - oldestRequest)) / 1000);
    return {
      allowed: false,
      message: `Rate limit exceeded. You can send ${AI_RATE_LIMIT.maxRequests} AI requests per minute. Please try again in ${timeUntilReset} seconds.`
    };
  }
  
  // Add current request
  userLimits.requests.push(now);
  userLimits.lastRequest = now;
  aiRequestLimiter.set(userId, userLimits);
  
  return { allowed: true };
};

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, limits] of aiRequestLimiter.entries()) {
    if (now - limits.lastRequest > AI_RATE_LIMIT.timeWindow * 2) {
      aiRequestLimiter.delete(userId);
    }
  }
}, 300000);

// Helper function to parse cookies from cookie header string
const parseCookies = (cookieHeader) => {
  const cookies = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.trim().split('=');
      if (parts.length === 2) {
        cookies[parts[0]] = parts[1];
      }
    });
  }
  return cookies;
};

io.use(async(socket, next) => {
  try {
    // Try to get token from auth, authorization header, or cookies
    let token = socket.handshake.auth.token || 
                socket.handshake.headers['authorization']?.split(' ')[1];
    
    // If no token found, try reading from cookies
    if (!token) {
      const cookieHeader = socket.handshake.headers.cookie;
      const cookies = parseCookies(cookieHeader);
      token = cookies.token;
    }

    const projectId = socket.handshake.query.projectId;

    if(!mongoose.Types.ObjectId.isValid(projectId)){
      return next(new Error('Invalid Project ID format'));
    }

    socket.Project = await Project.findById(projectId);
    if (!token) {
      console.log('Socket auth failed: No token provided. Headers:', socket.handshake.headers.cookie ? 'Has cookies' : 'No cookies');
      return next(new Error('Authentication error: Token not provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if(!decoded){
      return next(new Error('Authentication error: Invalid token'));
    }

    socket.user = decoded;
    next();
  } catch (error) {
    next(error);
  }
})

io.on('connection',async (socket)=>{
    console.log("Socket io is connected");
    socket.join(socket.Project._id.toString());

     socket.on('message',async(data)=>{
      console.log(data);

      const message = data.message;

      const aiIsPresent = message.includes('@ai')

      if(aiIsPresent){
        console.log("ai message");
        
        // Check rate limit
        const userId = socket.user._id || socket.user.id;
        const rateLimitCheck = checkAiRateLimit(userId);
        
        if (!rateLimitCheck.allowed) {
          const rateLimitMessage = {
            message: `⚠️ ${rateLimitCheck.message}`,
            sender: {
              _id: 'ai-bot',
              email: 'AI Bot'
            }
          };
          socket.emit('message', rateLimitMessage);
          return;
        }
        
        const prompt = message.replace('@ai','').trim();
        const provider = data.aiProvider || 'gemini';

        try {
          let result;

          if(provider === 'huggingface'){
            const {main: hfMain} = await import('./services/Hugging_Face_Ai.js');
            result = await hfMain(prompt);
          } else if(provider === 'openai'){
            const {main: openaiMain} = await import('./services/OpenAI_Service.js');
            result = await openaiMain(prompt);
          } else {
            result = await main(prompt);
          }
         
          let cleanedResult = result.trim();
          if (cleanedResult.startsWith('```json')) {
            cleanedResult = cleanedResult.replace(/^```json\s*/, '').replace(/\s*```$/, '');
          } else if (cleanedResult.startsWith('```')) {
            cleanedResult = cleanedResult.replace(/^```\s*/, '').replace(/\s*```$/, '');
          }

          let aiResponse;
          try {
            aiResponse = JSON.parse(cleanedResult);
            if (aiResponse.fileTree) {
              console.log("FileTree keys:", Object.keys(aiResponse.fileTree));
            }
          } catch (error) {
            console.log("AI response is not JSON, sending as plain text", error.message);
            aiResponse = { text: cleanedResult };
          }

          const messageToSend = {
            message: aiResponse.text || cleanedResult,
            fileTree: aiResponse.fileTree,
            sender:{
              _id: 'ai-bot',
              email: 'AI Bot'
            }
          };
          
          io.to(socket.Project._id.toString()).emit('message', messageToSend);
        } catch (error) {
          console.error('AI Service Error:', error.message);
          
          
          const errorMessage = {
            message: error.message || '⚠️ AI service is temporarily unavailable. Please try again later.',
            sender: {
              _id: 'ai-bot',
              email: 'AI Bot'
            }
          };
          
          io.to(socket.Project._id.toString()).emit('message', errorMessage);
        }
        return;
      }
      
      socket.broadcast.to(socket.Project._id.toString()).emit('message',data);
     })


     socket.on('disconnect',()=>{
      console.log('Socket disconnected');
      socket.leave(socket.Project._id.toString());
     })
})


server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
