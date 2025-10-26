import React, { useState } from 'react'
import { useAppContext } from '../context/context'
import axios from '../config/axios'
// import { useAppContext } from '../context/context'

const Home = () => {
  const { user } = useAppContext()
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');


  const createProject = async (e) => {
    e.preventDefault();
    console.log(projectName);
    
  await axios.post('/project/create-project', { name: projectName })
    .then((res)=>{
        console.log('Project created:', res.data);
        setIsModalOpen(false);
    })
    .catch((err)=>{
    console.error('Error creating project:', err, err?.response?.data || err?.message);
    });
  }

  return (
    <div>
      <main className='p-4'>

           <div className='projects'>
            <button className='project p-4 border border-slate-300  rounded-md' onClick={()=> setIsModalOpen(true)}>
                New Project
                <i className='ri-link ml-2'></i>
            </button>


            {isModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
                <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
                  <h2 className="mb-4 text-lg font-semibold text-black">Create New Project</h2>

                  <form
                    onSubmit={createProject}
                  >
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Project name
                    </label>
                    <input
                      name="projectName"
                      type="text"
                      placeholder="Enter project name"
                      className="mb-4 w-full rounded border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-black"
                      onChange={(e)=> setProjectName(e.target.value)}
                      value={projectName}
                      required
                    />

                    <div className="flex justify-end space-x-2">
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="rounded bg-gray-200 px-4 py-2 text-sm text-black"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
                      >
                        Create
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

           </div>
      </main>
    </div>
  )
}

export default Home
