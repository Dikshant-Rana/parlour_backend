require('dotenv').config({ path: './config/.env' });
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const readline = require('readline');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Create SQLite database connection
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

async function createAdmin() {
    try {
        console.log("Connected to SQLite database:", dbPath);

        // Get admin credentials from user
        const username = await new Promise(resolve => {
            rl.question('Enter admin username (default: admin): ', answer => {
                resolve(answer.trim() || 'admin');
            });
        });

        const password = await new Promise(resolve => {
            rl.question('Enter admin password (default: Admin@123): ', answer => {
                resolve(answer.trim() || 'Admin@123');
            });
        });

        // Hash the password
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // Check if admin already exists
        const checkQuery = 'SELECT * FROM admin_users WHERE username = ?';
        const existing = await new Promise((resolve, reject) => {
            db.get(checkQuery, [username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (existing) {
            // Update existing admin
            const updateQuery = 'UPDATE admin_users SET password_hash = ? WHERE username = ?';
            await new Promise((resolve, reject) => {
                db.run(updateQuery, [password_hash, username], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });
            console.log(`Admin user '${username}' password updated successfully!`);
        } else {
            // Create new admin
            const insertQuery = 'INSERT INTO admin_users (username, password_hash) VALUES (?, ?)';
            await new Promise((resolve, reject) => {
                db.run(insertQuery, [username, password_hash], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });
            console.log(`Admin user '${username}' created successfully!`);
        }

        console.log('You can now login at the admin panel');

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        db.close();
        rl.close();
    }
}

createAdmin();
