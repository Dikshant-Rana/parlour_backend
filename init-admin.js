require('dotenv').config({ path: './config/.env' });
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Create connection
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "parlourDB",
    port: process.env.DB_PORT || 3306
});

async function createAdmin() {
    try {
        await new Promise((resolve, reject) => {
            db.connect(err => {
                if (err) reject(err);
                else resolve();
            });
        });

        console.log("Connected to MySQL");

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
            db.query(checkQuery, [username], (err, results) => {
                if (err) reject(err);
                else resolve(results);
            });
        });

        if (existing.length > 0) {
            // Update existing admin
            const updateQuery = 'UPDATE admin_users SET password_hash = ? WHERE username = ?';
            await new Promise((resolve, reject) => {
                db.query(updateQuery, [password_hash, username], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            console.log(`Admin user '${username}' password updated successfully!`);
        } else {
            // Create new admin
            const insertQuery = 'INSERT INTO admin_users (username, password_hash) VALUES (?, ?)';
            await new Promise((resolve, reject) => {
                db.query(insertQuery, [username, password_hash], (err) => {
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
        db.end();
        rl.close();
    }
}

createAdmin();
