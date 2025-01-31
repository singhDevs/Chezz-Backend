import express from 'express';
import cors from 'cors';
import { generateToken, loginUser, registerUser } from './auth/auth';
import authRouter from './routes/auth.routes';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

app.post('/v1/register', async (req, res) => {
    try {
        const user = await registerUser(req.body.email, req.body.password, req.body.username);
        res.status(201)
            .json({
                userId: user.id,
                message: 'User registered successfully!',
            })
    } catch (error: any) {
        res.status(400)
            .json({
                message: error.message
            });
    }
});

app.post('/v1/auth', authRouter);

app.listen(3000, () => {
    console.log('Server is listening on port 3000...');
});