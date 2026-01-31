require('dotenv').config({ path: './config/.env' });
const mysql = require('mysql2');

// Create connection
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    port: process.env.DB_PORT || 3306
});

// Connect and create database + table
db.connect(err => {
    if (err) {
        console.error("Connection failed:", err.message);
        return;
    }

    console.log("Connected to MySQL");

    // Create database
    db.query(`CREATE DATABASE IF NOT EXISTS parlourDB`, (err) => {
        if (err) {
            console.error("Database creation failed:", err.message);
            return;
        }

        console.log("Database 'parlourDB' created or already exists");

        // Use the database
        db.query(`USE parlourDB`, (err) => {
            if (err) {
                console.error("Failed to use database:", err.message);
                return;
            }

            // Create bookings table
            const createBookingsTableSQL = `
               CREATE TABLE IF NOT EXISTS bookings (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    booking_id VARCHAR(36) NOT NULL UNIQUE,
                    customer_name VARCHAR(100) NOT NULL,
                    phone VARCHAR(20) NOT NULL,
                    email VARCHAR(100),
                    service VARCHAR(100) NOT NULL,
                    booking_date DATE NOT NULL,
                    preferred_time TIME NOT NULL,
                    amount DECIMAL(10,2) NOT NULL DEFAULT 100,
                    payment_status ENUM('PENDING','PAID') DEFAULT 'PENDING',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;

            db.query(createBookingsTableSQL, (err) => {
                if (err) {
                    console.error("Bookings table creation failed:", err.message);
                    db.end();
                    return;
                }

                console.log("Bookings table created successfully!");

                // Create admin users table
                const createAdminTableSQL = `
                    CREATE TABLE IF NOT EXISTS admin_users (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        username VARCHAR(50) NOT NULL UNIQUE,
                        password_hash VARCHAR(255) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        last_login TIMESTAMP NULL
                    )
                `;

                db.query(createAdminTableSQL, (err) => {
                    if (err) {
                        console.error("❌ Admin table creation failed:", err.message);
                    } else {
                        console.log("Admin users table created successfully!");
                        console.log("Database setup complete!");
                        console.log("Run 'npm run init-admin' to create the default admin user");
                    }

                    db.end();
                });
            });
        });
    });
});