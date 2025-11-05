import * as ai from '../services/ai_service.js';

const getResult = async(req, res)=>{
    try {
        const prompt = req.query.prompt;
        
        
        if (!prompt) {
            return res.status(400).json({ 
                error: 'Prompt is required',
                message: 'Please provide a prompt in the query string: ?prompt=your+question'
            });
        }
        
        const result = await ai.main(prompt);
        
        res.json({ 
            success: true,
            result: result 
        });
    } catch (error) {
        console.error('Error fetching AI result:', error);
        res.status(500).json({ 
            error: 'Failed to fetch AI result',
            message: error.message,
            details: error.stack
        });
    }
}

export {getResult};