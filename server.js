const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Import routes (we'll create these next)
const listsRoutes = require('./routes/lists');
const tasksRoutes = require('./routes/tasks');
const sharesRoutes = require('./routes/shares');

// Test route
app.get('/', (req, res) => {
    res.json({ message: 'Todo API is running!' });
});

// Use routes
app.use('/api/lists', listsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/shares', sharesRoutes);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});