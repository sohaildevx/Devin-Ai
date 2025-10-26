import userModel from "../models/userModel.js";
import { createUser } from "../services/user_services.js";
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

        res.status(200).json({user, token});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }

}

const profileController = async(req,res)=>{
     try {
        res.status(200).json({user:req.user});
     } catch (error) {
        res.status(500).json({ error: error.message });
     }
}

const logOutController = async(req,res)=>{
    try {

        const token = req.cookies.token || req.header('Authorization').replace('Bearer ','');

        redisClient.set(token,"logout",'EX',60*60*24); // Expire in 24 hours

        res.status(200).json({message:'Logged out successfully'});
        
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}


export {
    createUserController,
    loginController,
    profileController,
    logOutController
}