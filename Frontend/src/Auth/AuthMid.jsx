import React, {useState, useEffect} from 'react'
import { useAppContext } from '../context/context'
import { useNavigate } from 'react-router-dom';
import axios from '../config/axios';

// In-memory token storage as fallback
let inMemoryToken = null;

export const setInMemoryToken = (token) => {
    inMemoryToken = token;
};

export const getInMemoryToken = () => {
    return inMemoryToken;
};

export const clearInMemoryToken = () => {
    inMemoryToken = null;
};

const AuthMid = ({children}) => {
    const {user, setUser} = useAppContext();
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(()=>{
        let isMounted = true;
        let timeoutId = null;
        
        const checkAuth = async () => {
            try {
                // Try to fetch user profile - cookies or Authorization header will be sent
                const response = await axios.get('/user/profile');
                
                if(!isMounted) return;
                
                // Clear timeout since auth succeeded
                if(timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                
                if(response.data && response.data.user){
                    setUser(response.data.user);
                    setLoading(false);
                } else {
                    // No user found, redirect to login
                    setLoading(false);
                    window.__appToken = null; // Clear token
                    navigate('/login', { replace: true });
                }
            } catch (error) {
                // Not authenticated or error, redirect to login
                if(!isMounted) return;
                
                // Clear timeout since we got an error (don't need timeout anymore)
                if(timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                
                console.error('Auth check failed:', error.response?.status === 401 ? 'Not authenticated' : error.message);
                setLoading(false);
                window.__appToken = null; // Clear token
                navigate('/login', { replace: true });
            }
        };

        // If user is already set, we're good
        if(user && user._id){
            setLoading(false);
            return;
        }

        // Add timeout fallback in case request hangs (shouldn't happen with axios timeout)
        timeoutId = setTimeout(() => {
            console.error('Auth check timeout - backend may be unreachable');
            setLoading(false);
            window.__appToken = null; // Clear token
            navigate('/login', { replace: true });
        }, 15000); // 15 second timeout

        // Otherwise, check auth by fetching profile
        checkAuth();
        
        return () => {
            isMounted = false;
            if(timeoutId) {
                clearTimeout(timeoutId);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    if(loading){
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-900">
                <div className="text-white text-lg">Loading...</div>
            </div>
        )
    }
    
    // Only render children if user is authenticated
    if(!user){
        return null;
    }
    
    return <>{children}</>
}

export default AuthMid
