import Project from "../models/project_model.js";

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

export{
    createProject
}