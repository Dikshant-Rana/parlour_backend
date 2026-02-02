require('dotenv').config({ path: './config/.env' });
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create SQLite database connection
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

// Setup SQLite database and create tables
console.log("Connected to SQLite database:", dbPath);

// Create bookings table
const createBookingsTableSQL = `
    CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        service TEXT NOT NULL,
        booking_date DATE NOT NULL,
        preferred_time TIME NOT NULL,
        amount REAL NOT NULL DEFAULT 100,
        payment_status TEXT CHECK(payment_status IN ('PENDING','PAID')) DEFAULT 'PENDING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`;

db.run(createBookingsTableSQL, (err) => {
    if (err) {
        console.error("Bookings table creation failed:", err.message);
        db.close();
        return;
    }

    console.log("Bookings table created successfully!");

    // Create admin users table
    const createAdminTableSQL = `
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME NULL
        )
    `;

    db.run(createAdminTableSQL, (err) => {
        if (err) {
            console.error("❌ Admin table creation failed:", err.message);
        } else {
            console.log("Admin users table created successfully!");
            console.log("Database setup complete!");
            console.log("Run 'npm run init-admin' to create the default admin user");
        }

        db.close();
    });
});