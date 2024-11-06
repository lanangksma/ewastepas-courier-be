import 'dotenv/config';
import express from 'express';
import cors from 'cors'; // Change here
import routes from './routes/index.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import wasteRoutes from './routes/wasteRoutes.js';
import pickupRoutes from './routes/pickupRoutes.js';
import dropboxRoutes from './routes/dropboxRoutes.js';

const app = express();

const corsOptions = {
    origin: ['http://localhost:8000', 'http://127.0.0.1:8000'], // Allowed domains
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], // Allowed HTTP methods
    credentials: true // If you want to send cookies or other credentials
};

app.use(express.json());
app.use(cors(corsOptions));

// Use routes
app.use('/api', routes, wasteRoutes, pickupRoutes, dropboxRoutes, authRoutes, userRoutes);

export default app;
