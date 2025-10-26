import { Router } from "express";
import { body } from "express-validator";
import * as projectController from "../controllers/project_controller.js";
import { authUser } from "../middleware/authMid.js";

const router = Router();

router.post('/create-project', authUser,
    body('name').isString().withMessage('Name is required'),
    projectController.createProjectController
);
export default router;