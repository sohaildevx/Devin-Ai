import http from 'http';
import app from './app.js';
import {Server} from 'socket.io';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Project from './models/project_model.js';
import { main } from './services/ai_service.js';

const PORT = process.env.PORT || 8001;

const server = http.createServer(app);
const io = new Server(server,{
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
  }
});

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
