import http from 'http';
import app from './app.js';
import {Server} from 'socket.io';
import jwt from 'jsonwebtoken';

const PORT = process.env.PORT || 8001;

const server = http.createServer(app);
const io = new Server(server,{
  cors: {
    origin: '*'
  }
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers['authorization']?.split(' ')[1];
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

io.on('connection',(socket)=>{
    console.log("Socket io is connected");

})


server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
