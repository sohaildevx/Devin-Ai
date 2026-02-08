import React, { useState, useEffect } from "react";
import { useAppContext } from "../context/context";
import axios from "../config/axios";
import { useNavigate } from "react-router-dom";
import { deleteCookie } from "../utils/cookies";

const Home = () => {
  const { user, setUser } = useAppContext();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await axios.get("/user/logout").catch(() => {});
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      deleteCookie("token");
      delete window.__appToken;
      navigate("/login");
    }
  };

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get("/project/all");
      setProjects(res.data.projects);
    } catch (err) {
      console.error(
        "Error fetching projects:",
        err,
        err?.response?.data || err?.message
      );
    } finally {
      setIsLoading(false);
    }
  };

  const createProject = async (e) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const res = await axios.post("/project/create-project", { name: projectName });
      console.log("Project created:", res.data);
      setIsModalOpen(false);
      setProjectName("");
      // Refresh the projects list
      await fetchProjects();
    } catch (err) {
      console.error(
        "Error creating project:",
        err,
        err?.response?.data || err?.message
      );
      alert("Failed to create project. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900">
      <main className="p-4 max-w-full mx-auto">
        {user && (
          <p className="text-sm text-gray-400 mb-4">
            <i className="ri-user-line mr-1"></i>
            {user.email}
          </p>
        )}
        
        <div className="projects flex flex-wrap gap-3 items-center">
          <button
            className="project p-4 border border-gray-700 rounded-md hover:bg-gray-800 transition bg-gray-800 text-white"
            onClick={() => setIsModalOpen(true)}
          >
            New Project
            <i className="ri-link ml-2"></i>
          </button>

          {isLoading ? (
            <div className="text-white">Loading projects...</div>
          ) : (
            projects.map((project) => (
            <div
              key={project._id}
              className="project p-4 border border-gray-700 rounded-md cursor-pointer flex flex-col gap-2 min-w-52 hover:bg-gray-700 bg-gray-800 text-white"
              onClick={() =>
                navigate(`/project/`, {
                  state: { projectId: project._id },
                })
              }
            >
              <h2 className="font-semibold">{project.name}</h2>

              <div className="flex gap-2">
                <p>
                  <i className="ri-user-line"></i> <small>Collaborators</small>
                </p>
                {project.users.length}
              </div>
            </div>
            ))
          )}

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-4 bg-red-600 hover:bg-red-700 text-white rounded-md transition font-medium ml-auto"
          >
            <i className="ri-logout-box-line"></i>
            Logout
          </button>

          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
              <div className="w-full max-w-md rounded-lg bg-gray-800 p-6 shadow-lg border border-gray-700">
                <h2 className="mb-4 text-lg font-semibold text-white">
                  Create New Project
                </h2>

                <form onSubmit={createProject}>
                  <label className="mb-2 block text-sm font-medium text-gray-300">
                    Project name
                  </label>
                  <input
                    name="projectName"
                    type="text"
                    placeholder="Enter project name"
                    className="mb-4 w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-gray-400"
                    onChange={(e) => setProjectName(e.target.value)}
                    value={projectName}
                    required
                  />

                  <div className="flex justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="rounded bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreating}
                      className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed"
                    >
                      {isCreating ? "Creating..." : "Create"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Home;
