const express = require('express');
const router = express.Router();
const pool = require('../db');

// CREATE a new list
router.post('/', async (req, res) => {
    const { title, owner_id } = req.body;

    // 1. Validate input
    if (!title || !owner_id) {
        return res.status(400).json({ error: 'Title and owner_id are required' });
    }


    // 2. Create list in database
    try {
        const result = await pool.query(
            'INSERT INTO lists (title, owner_id) VALUES ($1, $2) RETURNING *',
            [title, owner_id]
        );
        const list = result.rows[0];

        // 3. Automatically add owner to list_shares with 'owner' permission
        await pool.query(
            'INSERT INTO list_shares (list_id, user_id, permission) VALUES ($1, $2, $3)',
            [list.id, owner_id, 'owner']
        );

        // 4. Return created list
        res.status(201).json(list);
    } catch (error) {
        console.error('Error creating list:', error);
        res.status(500).json({ error: 'Failed to create list' });
    }
});

// GET all lists for a user (owned + shared)
router.get('/user/:userId', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT l.*, ls.permission
            FROM lists l
            JOIN list_shares ls ON l.id = ls.list_id
            WHERE ls.user_id = $1
            ORDER BY l.created_at DESC
        `, [req.params.userId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching lists:', error);
        res.status(500).json({ error: 'Failed to fetch lists' });
    }
});

// GET single list
router.get('/:id', async (req, res) => {
    try {
        // Get list details
        const listResult = await pool.query(`
            SELECT l.*, u.email as owner_email
            FROM lists l
            JOIN users u ON l.owner_id = u.id
            WHERE l.id = $1
        `, [req.params.id]);

        if (listResult.rows.length === 0) {
            return res.status(404).json({ error: 'List not found' });
        }

        // Get shared users
        const sharesResult = await pool.query(`
            SELECT u.id, u.email, ls.permission
            FROM list_shares ls
            JOIN users u ON ls.user_id = u.id
            WHERE ls.list_id = $1
        `, [req.params.id]);

        const list = listResult.rows[0];
        list.shared_with = sharesResult.rows;

        res.json(list);
    } catch (error) {
        console.error('Error fetching list:', error);
        res.status(500).json({ error: 'Failed to fetch list' });
    }
});

// UPDATE list
router.put('/:id', async (req, res) => {
    // Update list title
    try {
        const { title } = req.body;
        // Check permission first (only owner can update)
        const listResult = await pool.query('SELECT owner_id FROM lists WHERE id = $1', [req.params.id]);
        if (listResult.rows.length === 0) {
            return res.status(404).json({ error: 'List not found' });
        }
        const ownerId = listResult.rows[0].owner_id;
        const requesterId = req.header('X-User-Id');
        // Check if user id is provided
        if (!requesterId) {
            return res.status(401).json({ error: 'User ID required in X-User-Id header' });
        }
        if (parseInt(requesterId) !== ownerId) {
            return res.status(403).json({ error: 'Only the owner can update this list' });
        }
        const result = await pool.query(
            'UPDATE lists SET title = $1 WHERE id = $2 RETURNING *',
            [title, req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'List not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating list:', error);
        res.status(500).json({ error: 'Failed to update list' });
    }

});

// DELETE list
router.delete('/:id', async (req, res) => {
    // Delete list
    try {
        // Check if list exists and get owner_id
        const listResult = await pool.query('SELECT owner_id FROM lists WHERE id = $1', [req.params.id]);
        if (listResult.rows.length === 0) {
            return res.status(404).json({ error: 'List not found' });
        }
        const ownerId = listResult.rows[0].owner_id;
        // Check if requester is owner (for simplicity, we assume requester ID is sent in header)
        const requesterId = req.header('X-User-Id');
        // Check if user id is provided
        if (!requesterId) {
            return res.status(401).json({ error: 'User ID required in X-User-Id header' });
        }
        if (parseInt(requesterId) !== ownerId) {
            return res.status(403).json({ error: 'Only the owner can delete this list' });
        }
        // Proceed to delete
        const result = await pool.query('DELETE FROM lists WHERE id = $1 RETURNING *', [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'List not found' });
        }
        res.json({ message: 'List deleted' });


    } catch (error) {
        console.error('Error deleting list:', error);
        res.status(500).json({ error: 'Failed to delete list' });
    }
    // Check permission first (only owner can delete)
    // CASCADE will auto-delete tasks and shares
});

module.exports = router;