import express from 'express';
import morgan from 'morgan';
import connectDB from './DB/db.js';
import userRoutes from './routes/userRoutes.js';
import cookie from 'cookie-parser';
import cors from 'cors';
import projectRoutes from './routes/projectRoutes.js';
import aiRoutes from './routes/ai_routes.js';

connectDB();

const app = express();

app.use(cors({
  credentials: true,
  origin: process.env.FRONTEND_URL
}));
app.use(cookie());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/user', userRoutes);
app.use('/project', projectRoutes);
app.use('/ai', aiRoutes);

app.get('/', (req, res) => {
  res.send('Devin AI Backend is running');
});

export default app;