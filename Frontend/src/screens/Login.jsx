import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from '../config/axios'
import { useAppContext } from '../context/context'


const Login = () => {
  const navigate = useNavigate()
  const { setUser } = useAppContext()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
     
      if (!email || !password) {
        setError('Please enter email and password')
        setLoading(false)
        return
      }

      const res = await axios.post('/user/login', { email, password })

      // Store token in memory as fallback for cookie issues
      if (res?.data?.token) {
        window.__appToken = res.data.token;
      }

      // Cookie is set automatically by backend, just set user in context
      if (res?.data?.user) {
        setUser(res.data.user)
      }

      await new Promise((resDelay) => setTimeout(resDelay, 300))

      navigate('/')
    } catch (err) {
    
      if (err.response && err.response.data) {
        const data = err.response.data
        if (data.errors && Array.isArray(data.errors)) {
          setError(data.errors.map((d) => d.msg || d.message).join(', '))
        } else if (data.error) {
          setError(data.error)
        } else {
          setError(JSON.stringify(data))
        }
      } else {
        setError(err.message || 'Network error')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100 px-4">
      <div className="max-w-md w-full bg-gray-800/60 backdrop-blur-sm border border-gray-700 rounded-2xl p-8 shadow-lg">
        <h2 className="text-3xl font-semibold mb-2 text-white">Welcome back</h2>
        <p className="text-sm text-gray-300 mb-6">Sign in to your account</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className="w-full px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && <div className="text-sm text-red-400">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 font-medium"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-300">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="text-indigo-400 hover:underline">
            Create one
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Login
