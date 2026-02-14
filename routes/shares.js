const express = require('express');
const router = express.Router();
const pool = require('../db');

// SHARE list with another user
router.post('/', async (req, res) => {
    const { list_id, user_id, permission } = req.body;

    if (!list_id || !user_id || !permission) {
        return res.status(400).json({ error: 'list_id, user_id, and permission are required' });
    }

    const validPermissions = ['owner', 'editor', 'viewer'];
    if (!validPermissions.includes(permission)) {
        return res.status(400).json({ error: 'Permission must be owner, editor, or viewer' });
    }

    try {
        const listResult = await pool.query('SELECT owner_id FROM lists WHERE id = $1', [list_id]);
        if (listResult.rows.length === 0) {
            return res.status(404).json({ error: 'List not found' });
        }

        const requesterId = req.header('X-User-Id');
        if (!requesterId) {
            return res.status(401).json({ error: 'User ID required in X-User-Id header' });
        }

        if (parseInt(listResult.rows[0].owner_id) !== parseInt(requesterId)) {
            return res.status(403).json({ error: 'Only owner can share this list' });
        }

        const existingShare = await pool.query(
            'SELECT * FROM list_shares WHERE list_id = $1 AND user_id = $2',
            [list_id, user_id]
        );

        if (existingShare.rows.length > 0) {
            return res.status(400).json({ error: 'User already has access' });
        }

        const result = await pool.query(
            'INSERT INTO list_shares (list_id, user_id, permission) VALUES ($1, $2, $3) RETURNING *',
            [list_id, user_id, permission]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error('Error sharing list:', error);
        res.status(500).json({ error: 'Failed to share list' });
    }
});

// UPDATE permission
router.put('/', async (req, res) => {
    const { list_id, user_id, permission } = req.body;

    const validPermissions = ['owner', 'editor', 'viewer'];
    if (!validPermissions.includes(permission)) {
        return res.status(400).json({ error: 'Invalid permission level' });
    }

    try {
        const listResult = await pool.query('SELECT owner_id FROM lists WHERE id = $1', [list_id]);
        if (listResult.rows.length === 0) {
            return res.status(404).json({ error: 'List not found' });
        }

        const requesterId = req.header('X-User-Id');
        if (!requesterId) {
            return res.status(401).json({ error: 'User ID required' });
        }

        if (parseInt(listResult.rows[0].owner_id) !== parseInt(requesterId)) {
            return res.status(403).json({ error: 'Only owner can update permissions' });
        }

        const updateResult = await pool.query(
            'UPDATE list_shares SET permission = $1 WHERE list_id = $2 AND user_id = $3 RETURNING *',
            [permission, list_id, user_id]
        );

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ error: 'Share not found' });
        }

        res.json(updateResult.rows[0]);

    } catch (error) {
        console.error('Error updating permissions:', error);
        res.status(500).json({ error: 'Failed to update permissions' });
    }
});

// REMOVE access
router.delete('/', async (req, res) => {
    const { list_id, user_id } = req.body;

    try {
        const listResult = await pool.query('SELECT owner_id FROM lists WHERE id = $1', [list_id]);
        if (listResult.rows.length === 0) {
            return res.status(404).json({ error: 'List not found' });
        }

        const requesterId = req.header('X-User-Id');
        if (!requesterId) {
            return res.status(401).json({ error: 'User ID required' });
        }

        if (parseInt(listResult.rows[0].owner_id) !== parseInt(requesterId)) {
            return res.status(403).json({ error: 'Only owner can remove users' });
        }

        if (parseInt(user_id) === parseInt(requesterId)) {
            return res.status(400).json({ error: 'Cannot remove yourself' });
        }

        const deleteResult = await pool.query(
            'DELETE FROM list_shares WHERE list_id = $1 AND user_id = $2 RETURNING *',
            [list_id, user_id]
        );

        if (deleteResult.rows.length === 0) {
            return res.status(404).json({ error: 'Share not found' });
        }

        res.json({ message: 'Access removed successfully' });

    } catch (error) {
        console.error('Error removing access:', error);
        res.status(500).json({ error: 'Failed to remove access' });
    }
});

// GET shared users
router.get('/list/:listId', async (req, res) => {
    try {
        const requesterId = req.header('X-User-Id');
        if (!requesterId) {
            return res.status(401).json({ error: 'User ID required' });
        }

        const permissionCheck = await pool.query(
            'SELECT permission FROM list_shares WHERE list_id = $1 AND user_id = $2',
            [req.params.listId, requesterId]
        );

        if (permissionCheck.rows.length === 0) {
            return res.status(403).json({ error: 'No permission to view shares' });
        }

        const result = await pool.query(`
            SELECT u.id AS user_id, u.email, ls.permission, ls.shared_at
            FROM list_shares ls
            JOIN users u ON ls.user_id = u.id
            WHERE ls.list_id = $1
            ORDER BY ls.shared_at DESC
        `, [req.params.listId]);

        res.json(result.rows);

    } catch (error) {
        console.error('Error fetching shares:', error);
        res.status(500).json({ error: 'Failed to fetch shares' });
    }
});

module.exports = router;