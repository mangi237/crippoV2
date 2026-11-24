import dotenv from 'dotenv';
import { createApiApp } from '../server/apiApp';

dotenv.config();

const app = createApiApp();

export default app;
