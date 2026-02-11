import userModel from "../models/userModel.js";
import { createUser,getAllUsers } from "../services/user_services.js";
import {validationResult} from 'express-validator';
import { redisClient } from "../services/Redis_Services.js";


const createUserController = async(req,res)=>{
    const errors = validationResult(req);

    if(!errors.isEmpty()){
        return res.status(400).json({errors:errors.array()});
    }
    try {
        const user = await createUser(req.body);

        const token = await user.generateAuthToken();

        delete user._doc.password;
        
        // Set httpOnly cookie
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        };
        
        res.cookie('token', token, cookieOptions);
        
        res.status(201).json({ user, token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

const loginController = async(req,res)=>{
    const errors = validationResult(req);

    if(!errors.isEmpty()){
        return res.status(400).json({errors:errors.array()});
    }

    try {
        const {email, password} = req.body;

        const user = await userModel.findOne({email}).select('+password');

        if(!user){
            return res.status(400).json({error:'Invalid credentials'});
        }

        const isMatch = await user.isValidPassword(password);

        if(!isMatch){
            return res.status(400).json({error:'Password is incorrect'});
        }

        const token = user.generateAuthToken();

        delete user._doc.password;

        
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            path: '/',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            domain: process.env.NODE_ENV === 'production' ? undefined : 'localhost'
        };
        
        res.cookie('token', token, cookieOptions);

        res.status(200).json({user, token});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }

}

const profileController = async(req,res)=>{
     try {
        // Fetch full user document from database
        const user = await userModel.findOne({ email: req.user.email }).select('-password');
        
        if(!user){
            return res.status(404).json({error:'User not found'});
        }
        
        res.status(200).json({user: {
            _id: user._id,
            email: user.email
        }});
     } catch (error) {
        res.status(500).json({ error: error.message });
     }
}

const logOutController = async(req,res)=>{
    try {

        const token = req.cookies.token || req.header('Authorization')?.replace('Bearer ','');

        if(token){
            redisClient.set(token,"logout",'EX',60*60*24); // Expire in 24 hours
        }

        // Clear the cookie
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });

        res.status(200).json({message:'Logged out successfully'});
        
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

const getAllUsersController = async (req, res) => {
      try {
        const loggedInuser = await userModel.findOne({ email: req.user.email });
        const allUsers = await getAllUsers({userId: loggedInuser._id});

        return res.status(200).json({ users: allUsers });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
}


export {
    createUserController,
    loginController,
    profileController,
    logOutController,
    getAllUsersController
}