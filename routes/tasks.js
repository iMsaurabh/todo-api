const express = require('express');
const router = express.Router();
const pool = require('../db');

// CREATE task in a list
router.post('/', async (req, res) => {
    const { list_id, content } = req.body;

    // 1. Validate input
    if (!list_id || !content) {
        return res.status(400).json({ error: 'list_id and content are required' });
    }

    // 2. Check if user has permission to add tasks (owner or editor)
    const requesterId = req.header('X-User-Id');
    if (!requesterId) {
        return res.status(401).json({ error: 'User ID required in X-User-Id header' });
    }

    const permissionResult = await pool.query(`
        SELECT permission FROM list_shares WHERE list_id = $1 AND user_id = $2
    `, [list_id, requesterId]);

    if (permissionResult.rows.length === 0) {
        return res.status(403).json({ error: 'You do not have permission to add tasks to this list' });
    }

    const permission = permissionResult.rows[0].permission;
    if (permission !== 'owner' && permission !== 'editor') {
        return res.status(403).json({ error: 'You do not have permission to add tasks to this list' });
    }

    // 3. Create task
    try {
        const result = await pool.query(
            'INSERT INTO tasks (list_id, content) VALUES ($1, $2) RETURNING *',
            [list_id, content]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ error: 'Failed to create task' });
    }
});

// GET all tasks for a specific list
router.get('/list/:listId', async (req, res) => {
    // Get all tasks for a list

    // Check if user has permission to view tasks (owner, editor, or viewer)
    const requesterId = req.header('X-User-Id');
    if (!requesterId) {
        return res.status(401).json({ error: 'User ID required in X-User-Id header' });
    }
    const permissionResult = await pool.query(`
        SELECT permission FROM list_shares WHERE list_id = $1 AND user_id = $2
    `, [req.params.listId, requesterId]);
    if (permissionResult.rows.length === 0) {
        return res.status(403).json({ error: 'You do not have permission to view tasks in this list' });
    }
    // Fetch tasks
    // Order by created_at or completed status
    try {
        const result = await pool.query(
            'SELECT * FROM tasks WHERE list_id = $1 ORDER BY completed, created_at',
            [req.params.listId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

// UPDATE task (toggle completed or edit content)
router.put('/:id', async (req, res) => {
    const { content, completed } = req.body;

    // 1. Check permission (owner or editor can update)
    try {        // Get list_id for the task
        const taskResult = await pool.query('SELECT list_id FROM tasks WHERE id = $1', [req.params.id]);
        if (taskResult.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        const listId = taskResult.rows[0].list_id;
        const requesterId = req.header('X-User-Id');
        if (!requesterId) {
            return res.status(401).json({ error: 'User ID required in X-User-Id header' });
        }
        const permissionResult = await pool.query(`
            SELECT permission FROM list_shares WHERE list_id = $1 AND user_id = $2
        `, [listId, requesterId]);
        if (permissionResult.rows.length === 0) {
            return res.status(403).json({ error: 'You do not have permission to update tasks in this list' });
        }
        const permission = permissionResult.rows[0].permission;
        if (permission !== 'owner' && permission !== 'editor') {
            return res.status(403).json({ error: 'You do not have permission to update tasks in this list' });
        }

        // 2. Update task
        // Just update both fields (simpler for this case)
        const result = await pool.query(
            'UPDATE tasks SET content = COALESCE($1, content), completed = COALESCE($2, completed) WHERE id = $3 RETURNING *',
            [content, completed, req.params.id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// DELETE task
router.delete('/:id', async (req, res) => {
    // 1. Check permission (owner or editor can delete)
    try {
        const taskResult = await pool.query('SELECT list_id FROM tasks WHERE id = $1', [req.params.id]);
        if (taskResult.rows.length === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }
        const listId = taskResult.rows[0].list_id;
        const requesterId = req.header('X-User-Id');
        if (!requesterId) {
            return res.status(401).json({ error: 'User ID required in X-User-Id header' });
        }
        const permissionResult = await pool.query(`
            SELECT permission FROM list_shares WHERE list_id = $1 AND user_id = $2
        `, [listId, requesterId]);
        if (permissionResult.rows.length === 0) {
            return res.status(403).json({ error: 'You do not have permission to delete tasks in this list' });
        }
        const permission = permissionResult.rows[0].permission;
        if (permission !== 'owner' && permission !== 'editor') {
            return res.status(403).json({ error: 'You do not have permission to delete tasks in this list' });
        }

        // 2. Delete task
        const result = await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // 3. Return success message
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

module.exports = router;