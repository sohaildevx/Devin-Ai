import Project from "../models/project_model.js";
import { createProject } from "../services/project_service.js";
import { validationResult } from "express-validator";
import userModel from "../models/userModel.js";

const createProjectController = async(req,res)=>{

    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(400).json({errors:errors.array()});
    }

    try {
        const { name } = req.body;
        // ensure request is authenticated and req.user is present
        if (!req.user || !req.user.email) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // find the logged in user by email from req.user
        const loggedInUser = await userModel.findOne({ email: req.user.email });
        const userId = loggedInUser?._id;

        if (!userId) {
            return res.status(400).json({ error: 'Could not determine user from token' });
        }

        const newProject = await createProject({ name, userId });
        res.status(201).json({ newProject });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export { createProjectController };
