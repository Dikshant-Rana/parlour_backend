require('dotenv').config({ path: './config/.env' });
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Connect to MySQL
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "parlourDB",
    port: process.env.DB_PORT || 3306
});

db.connect(err => {
    if (err) {
        console.error("DB connection failed:", err.message);
    } else {
        console.log("Connected to MySQL");
        // Run cleanup once on server start (after connection is established)
        deleteExpiredPendingBookings();
    }
});

// ----------------------
// AUTO-DELETE OLD PENDING BOOKINGS (24 hours)
// ----------------------
function deleteExpiredPendingBookings() {
    const query = `
        DELETE FROM bookings 
        WHERE payment_status = 'PENDING' 
        AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `;

    db.query(query, (err, result) => {
        if (err) {
            console.error("Error deleting expired bookings:", err.message);
        } else if (result.affectedRows > 0) {
            console.log(`Deleted ${result.affectedRows} expired pending booking(s)`);
        }
    });
}

// Run cleanup every hour
setInterval(deleteExpiredPendingBookings, 60 * 60 * 1000);

// ----------------------
//   ADMIN LOGIN ENDPOINT
// ----------------------
app.post("/admin/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    try {
        // Get admin user from database
        const query = 'SELECT * FROM admin_users WHERE username = ?';

        db.query(query, [username], async (err, results) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ error: "Database error" });
            }

            if (results.length === 0) {
                return res.status(401).json({ error: "Invalid credentials" });
            }

            const admin = results[0];

            // Compare password with hashed password
            const isPasswordValid = await bcrypt.compare(password, admin.password_hash);

            if (!isPasswordValid) {
                return res.status(401).json({ error: "Invalid credentials" });
            }

            // Update last login time
            db.query('UPDATE admin_users SET last_login = NOW() WHERE id = ?', [admin.id]);

            // Generate JWT token
            const token = jwt.sign(
                { id: admin.id, username: admin.username },
                process.env.JWT_SECRET || 'your_jwt_secret_key_here',
                { expiresIn: '8h' }
            );

            res.json({
                success: true,
                message: "Login successful",
                token,
                username: admin.username
            });
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// ----------------------
// 🔒 MIDDLEWARE: Verify JWT Token
// ----------------------
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(403).json({ error: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
        req.admin = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: "Invalid or expired token" });
    }
};

// ----------------------
// 🔐 CHANGE PASSWORD ENDPOINT
// ----------------------
app.post("/admin/change-password", verifyToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current and new password are required" });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    try {
        // Get current admin user
        const query = 'SELECT * FROM admin_users WHERE id = ?';

        db.query(query, [req.admin.id], async (err, results) => {
            if (err) {
                return res.status(500).json({ error: "Database error" });
            }

            if (results.length === 0) {
                return res.status(404).json({ error: "Admin user not found" });
            }

            const admin = results[0];

            // Verify current password
            const isCurrentPasswordValid = await bcrypt.compare(currentPassword, admin.password_hash);

            if (!isCurrentPasswordValid) {
                return res.status(401).json({ error: "Current password is incorrect" });
            }

            // Hash new password
            const saltRounds = 10;
            const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

            // Update password
            const updateQuery = 'UPDATE admin_users SET password_hash = ? WHERE id = ?';
            db.query(updateQuery, [newPasswordHash, req.admin.id], (err) => {
                if (err) {
                    return res.status(500).json({ error: "Failed to update password" });
                }

                res.json({ success: true, message: "Password changed successfully" });
            });
        });
    } catch (error) {
        console.error("Change password error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// ----------------------
// 1️⃣ Create a new booking (PENDING)
// ----------------------
app.post("/bookings", (req, res) => {
    const { booking_id, customer_name, phone, email, service, booking_date, preferred_time } = req.body;
    const amount = 100; // fixed fee

    // Check if the slot is already booked (confirmed or pending)
    const checkSql = `
        SELECT * FROM bookings 
        WHERE booking_date = ? AND preferred_time = ? AND payment_status IN ('PENDING','PAID')
    `;

    db.query(checkSql, [booking_date, preferred_time], (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (rows.length > 0) return res.status(400).json({ error: "Time slot already booked" });

        const insertSql = `
            INSERT INTO bookings
            (booking_id, customer_name, phone, email, service, booking_date, preferred_time, amount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(insertSql, [booking_id, customer_name, phone, email, service, booking_date, preferred_time, amount], (err2) => {
            if (err2) return res.status(500).json({ error: "Failed to create booking" });

            // Send response immediately
            res.json({
                success: true,
                message: "Booking created. Show QR to customer.",
                booking_id,
                amount
            });


        });
    });
});

// ----------------------
// 2️⃣ Admin marks booking as PAID (Protected Route)
// ----------------------
app.post("/admin/mark-paid", verifyToken, (req, res) => {
    const { booking_id } = req.body;

    const updateSql = `
        UPDATE bookings
        SET payment_status = 'PAID'
        WHERE booking_id = ?
    `;

    db.query(updateSql, [booking_id], async (err) => {
        if (err) return res.status(500).json({ error: "Failed to update booking" });

        // Send confirmation email to customer
        const getBooking = "SELECT * FROM bookings WHERE booking_id = ?";
        db.query(getBooking, [booking_id], async (err2, rows) => {
            if (err2 || rows.length === 0) return res.status(500).json({ error: "Booking not found" });
            const booking = rows[0];

            try {
                const transporter = nodemailer.createTransport({
                    host: process.env.EMAIL_HOST,
                    port: process.env.EMAIL_PORT,
                    secure: process.env.EMAIL_PORT == 465,
                    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
                });

                await transporter.sendMail({
                    from: `"Orchid Beauty Parlour" <${process.env.EMAIL_USER}>`,
                    to: booking.email,
                    subject: `Booking Confirmed: ${booking.booking_id}`,
                    html: `
                        <h3>Booking Confirmed!</h3>
                        <p><strong>Name:</strong> ${booking.customer_name}</p>
                        <p><strong>Service:</strong> ${booking.service}</p>
                        <p><strong>Date:</strong> ${booking.booking_date}</p>
                        <p><strong>Time:</strong> ${booking.preferred_time}</p>
                        <p><strong>Payment ID:</strong> ${booking.booking_id}</p>
                        <p>Status: <strong>PAID</strong></p>
                    `
                });
                await transporter.sendMail({
                    from: `"Orchid Beauty Parlour" <${process.env.EMAIL_USER}>`,
                    to: process.env.BUSINESS_EMAIL,
                    subject: `Booking Paid & Confirmed: ${booking.booking_id}`,
                    html: `
                       <h3>Payment Confirmed</h3>
                       <p><strong>Name:</strong> ${booking.customer_name}</p>
                       <p><strong>Phone:</strong> ${booking.phone}</p>
                       <p><strong>Email:</strong> ${booking.email}</p>
                       <p><strong>Service:</strong> ${booking.service}</p>
                       <p><strong>Date:</strong> ${booking.booking_date}</p>
                       <p><strong>Time:</strong> ${booking.preferred_time}</p>
                       <p><strong>Booking ID:</strong> ${booking.booking_id}</p>
                       <p>Status: <strong>PAID</strong></p>
    `
                });

            } catch (errEmail) {
                console.log("Email error:", errEmail);
            }

            res.json({ success: true, message: "Booking marked as PAID" });
        });
    });
});

// ----------------------
// 3️⃣ Get all pending bookings (Protected Route)
// ----------------------
app.get("/admin/pending-bookings", verifyToken, (req, res) => {
    db.query("SELECT * FROM bookings WHERE payment_status = 'PENDING'", (err, rows) => {
        if (err) return res.status(500).json({ error: "Failed to fetch pending bookings" });
        res.json(rows);
    });
});

// ----------------------
// 4️⃣ Get all bookings (Protected Route)
// ----------------------
app.get("/admin/bookings", verifyToken, (req, res) => {
    db.query("SELECT * FROM bookings ORDER BY booking_date DESC, preferred_time ASC", (err, rows) => {
        if (err) return res.status(500).json({ error: "Failed to fetch bookings" });
        res.json(rows);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`QR Booking Server running on port ${PORT}`));