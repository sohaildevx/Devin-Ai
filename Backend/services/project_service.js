import Project from "../models/project_model.js";
import mongoose from "mongoose";

const createProject = async({
    name,userId
})=>{
    
    if(!name){
        throw new Error('Project name is required');
    }

    if(!userId){
        throw new Error('User ID is required to create a project');
    }

  

    const project = await Project.create({
        name,
        users:[userId],
    });
    // return the created project so callers can send it back to clients
    return project;
}

const getAllProjects = async({userId})=>{
    if(!userId){
        throw new Error('User ID is required to get all projects');
    }

    const projects = await Project.find({ users: userId });
    return projects;
}

const addUserToProject = async({projectId,users, userId})=>{
    if(!projectId){
        throw new Error('Project ID is required to add users');
    }

    // Validate projectId is a valid mongoose ObjectId
    if(!mongoose.Types.ObjectId.isValid(projectId)){
        throw new Error('Invalid Project ID format');
    }

    if(!users || users.length === 0){
        throw new Error('User IDs are required to add users');
    }

    // Validate each user ID in the users array
    for(const userId of users){
        if(!mongoose.Types.ObjectId.isValid(userId)){
            throw new Error(`Invalid User ID format: ${userId}`);
        }
    }

    if(!userId){
        throw new Error('Requesting User ID is required to add users to project');
    }

    const project = await Project.findOne({ _id: projectId, users: userId });
    if(!project){
        throw new Error('Project not found');
    }

    // Convert string user IDs to ObjectId instances
    const userObjectIds = users.map(id => new mongoose.Types.ObjectId(id));

    const updatedProject = await Project.findOneAndUpdate({
        _id: projectId,
    },{
        $addToSet:{
            users:{
                $each: userObjectIds
            }
        }
    },{
        new:true
    }

)

    return updatedProject;
}

const getProjectById = async({projectId})=>{
    if(!projectId){
        throw new Error('Project ID is required to get project details');
    }

    if(!mongoose.Types.ObjectId.isValid(projectId)){
        throw new Error('Invalid Project ID format');
    }

    const project = await Project.findOne({
        _id: projectId,
    }).populate('users');

    return project;
}

export{
    createProject,
    getAllProjects,
    addUserToProject,
    getProjectById
}