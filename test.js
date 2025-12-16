const sql = require("mssql");

const config = {
    user: "zk",
    password: "admin@123",
    server: "192.168.101.165",
    database: "geon",
    port: 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

// Test connection when server starts
async function testDBConnection() {
    console.log("⏳ Checking database connection...");

    try {
        const pool = await sql.connect(config);
        console.log("✅ Database connected successfully!");
        return true;
    } catch (err) {
        console.error("❌ Database connection failed!");
        console.error("Error Message:", err.message);
        console.error("Code:", err.code);
        console.error("Stack:", err.stack);
        return false;
    }
}

testDBConnection();
