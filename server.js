const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const PDFDocument = require("pdfkit");
const moment = require("moment");


const app = express();
app.use(cors());

/* =======================
   SQL Server Config
======================= */
const config = {
    user: "zk",
    password: "admin@123",
    server: "192.168.101.165",
    database: "geon",
    options: {
        encrypt: false,
        trustServerCertificate: true
    },
    connectionTimeout: 450000,
    requestTimeout: 450000
};

/* =======================
   Helper Functions
======================= */

function getDayShort(dateObj) {
    // Convert Date object to ISO string, extract date part
    const isoString = dateObj.toISOString();
    const datePart = isoString.substring(0, 10); // YYYY-MM-DD
    return moment(datePart, 'YYYY-MM-DD').format('ddd');
}

function formatTime(dateObj) {
    // Convert Date object to ISO string, then extract HH:mm
    const isoString = dateObj.toISOString();
    return isoString.substring(11, 16);
}

function calculateDuration(startDateObj, endDateObj) {
    if (!startDateObj || !endDateObj) return "0h 0m";
    
    // Convert Date objects to ISO strings
    const startString = startDateObj.toISOString();
    const endString = endDateObj.toISOString();
    
    // Extract time components directly from ISO string
    const startHour = parseInt(startString.substring(11, 13));
    const startMin = parseInt(startString.substring(14, 16));
    const startSec = parseInt(startString.substring(17, 19));
    
    const endHour = parseInt(endString.substring(11, 13));
    const endMin = parseInt(endString.substring(14, 16));
    const endSec = parseInt(endString.substring(17, 19));
    
    // Convert to minutes
    const startTotalMins = startHour * 60 + startMin + startSec / 60;
    const endTotalMins = endHour * 60 + endMin + endSec / 60;
    
    const diffMins = Math.floor(endTotalMins - startTotalMins);
    if (diffMins <= 0) return "0h 0m";
    
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    return `${h}h ${m}m`;
}

function getOfficeEndTime(dateObj) {
    // Convert Date object to ISO string and extract date part
    const isoString = dateObj.toISOString();
    const datePart = isoString.substring(0, 10); // YYYY-MM-DD
    return `${datePart}T18:30:00.000Z`;
}

function calculateOvertimeMinutes(startDateOrString, endDateObj) {
    // Handle both string (from getOfficeEndTime) and Date object
    const startString = typeof startDateOrString === 'string' 
        ? startDateOrString 
        : startDateOrString.toISOString();
    const endString = endDateObj.toISOString();
    
    // Extract time components directly
    const startHour = parseInt(startString.substring(11, 13));
    const startMin = parseInt(startString.substring(14, 16));
    
    const endHour = parseInt(endString.substring(11, 13));
    const endMin = parseInt(endString.substring(14, 16));
    
    const startTotalMins = startHour * 60 + startMin;
    const endTotalMins = endHour * 60 + endMin;
    
    return Math.max(0, endTotalMins - startTotalMins);
}

/* =======================
   Attendance Processing
======================= */
function processAttendance(rows) {
    const map = {};

    rows.forEach(r => {
        if (!map[r.emp_code]) {
            map[r.emp_code] = {
                emp_code: r.emp_code,
                name: r.first_name || "-",
                punches: []
            };
        }
        map[r.emp_code].punches.push(r);
    });

    return Object.values(map).map(emp => {
        const inPunches = emp.punches.filter(p => p.terminal_alias === "In Device");
        const outPunches = emp.punches.filter(p => p.terminal_alias === "Out Device");

        const firstIn = inPunches.length ? inPunches[0].punch_time : null;
        const lastOut = outPunches.length ? outPunches[outPunches.length - 1].punch_time : null;

        let workingHours = "0h 0m";
        let overtime = "0h 0m";

        if (firstIn && lastOut) {
            workingHours = calculateDuration(firstIn, lastOut);

            const officeEnd = getOfficeEndTime(firstIn);
            
            // Compare ISO strings directly (both have times in IST)
            if (lastOut > officeEnd) {
                const otMins = calculateOvertimeMinutes(officeEnd, lastOut);
                const h = Math.floor(otMins / 60);
                const m = otMins % 60;
                overtime = `${h}h ${m}m`;
            }
        }

        return {
            emp_code: emp.emp_code,
            name: emp.name,
            day: firstIn ? getDayShort(firstIn) : "-",
            login: firstIn ? formatTime(firstIn) : "-",
            logout: lastOut ? formatTime(lastOut) : "-",
            workingHours,
            overtime
        };
    });
}


function processWeekAttendance(rows) {
    const map = {};

    rows.forEach(r => {
        // Convert Date object to ISO string and extract date
        const isoString = r.punch_time.toISOString();
        const dateKey = isoString.substring(0, 10); // YYYY-MM-DD
        const key = `${r.emp_code}_${dateKey}`;

        if (!map[key]) {
            map[key] = {
                emp_code: r.emp_code,
                name: r.first_name || "-",
                date: dateKey,
                punches: []
            };
        }
        map[key].punches.push(r);
    });

    return Object.values(map).map(emp => {
        const inPunches = emp.punches.filter(p => p.terminal_alias === "In Device");
        const outPunches = emp.punches.filter(p => p.terminal_alias === "Out Device");

        const firstIn = inPunches.length ? inPunches[0].punch_time : null;
        const lastOut = outPunches.length ? outPunches[outPunches.length - 1].punch_time : null;

        let workingHours = "0h 0m";
        let overtime = "0h 0m";

        if (firstIn && lastOut) {
            workingHours = calculateDuration(firstIn, lastOut);

            const officeEnd = getOfficeEndTime(firstIn);
            
            // Compare ISO strings directly
            if (lastOut > officeEnd) {
                const otMins = calculateOvertimeMinutes(officeEnd, lastOut);
                const h = Math.floor(otMins / 60);
                const m = otMins % 60;
                overtime = `${h}h ${m}m`;
            }
        }

        return {
            emp_code: emp.emp_code,
            name: emp.name,
            date: emp.date,
            day: firstIn ? getDayShort(firstIn) : "-",
            login: firstIn ? formatTime(firstIn) : "-",
            logout: lastOut ? formatTime(lastOut) : "-",
            workingHours,
            overtime
        };
    });
}


/* =======================
   BASIC APIs
======================= */

app.get("/api/transactions", async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request().query(`
            SELECT TOP 100 emp_code, punch_time
            FROM geonetp.dbo.iclock_transaction
            ORDER BY punch_time DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/face-system", async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request().query(`
            SELECT emp_code, first_name
            FROM geonetp.dbo.personnel_employee
            ORDER BY emp_code DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =======================
   PAGINATION API
======================= */
app.get("/api/merged-transactions", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const pool = await sql.connect(config);

        const count = await pool.request().query(`
            SELECT COUNT(*) AS total
            FROM geonetp.dbo.iclock_transaction
        `);

        const data = await pool.request()
            .input("offset", sql.Int, offset)
            .input("limit", sql.Int, limit)
            .query(`
                SELECT
                    t.emp_code,
                    e.first_name,
                    t.punch_time,
                    t.terminal_alias
                FROM geonetp.dbo.iclock_transaction t
                LEFT JOIN geonetp.dbo.personnel_employee e
                    ON t.emp_code = e.emp_code
                ORDER BY t.punch_time DESC
                OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
            `);

        res.json({
            page,
            limit,
            totalRecords: count.recordset[0].total,
            data: data.recordset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* =======================
   JSON ATTENDANCE APIs
======================= */

// Daily Attendance JSON API
app.get("/api/attendance/day", async (req, res) => {
    try {
        const date = req.query.date;
        if (!date) return res.status(400).json({ error: "Date required (format: YYYY-MM-DD)" });

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input("date", sql.Date, date)
            .query(`
                SELECT
                    t.emp_code,
                    e.first_name,
                    t.punch_time,
                    t.terminal_alias
                FROM geonetp.dbo.iclock_transaction t
                LEFT JOIN geonetp.dbo.personnel_employee e
                    ON t.emp_code = e.emp_code
                WHERE CAST(t.punch_time AS DATE) = @date
                ORDER BY t.emp_code, t.punch_time
            `);

        const attendance = processAttendance(result.recordset);

        res.json({
            success: true,
            date: date,
            totalEmployees: attendance.length,
            attendance: attendance
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Weekly Attendance JSON API
app.get("/api/attendance/week", async (req, res) => {
    try {
        const { start, end } = req.query;
        if (!start || !end) {
            return res.status(400).json({ 
                error: "Start and End dates required (format: YYYY-MM-DD)" 
            });
        }

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input("start", sql.Date, start)
            .input("end", sql.Date, end)
            .query(`
                SELECT
                    t.emp_code,
                    e.first_name,
                    t.punch_time,
                    t.terminal_alias
                FROM geonetp.dbo.iclock_transaction t
                LEFT JOIN geonetp.dbo.personnel_employee e
                    ON t.emp_code = e.emp_code
                WHERE CAST(t.punch_time AS DATE) BETWEEN @start AND @end
                ORDER BY t.emp_code, t.punch_time
            `);

        // Group by employee and date
        const grouped = {};
        const allAttendance = [];

        result.recordset.forEach(r => {
            // Convert Date object to ISO string and extract date
            const isoString = r.punch_time.toISOString();
            const date = isoString.substring(0, 10); // YYYY-MM-DD

            grouped[r.emp_code] ??= {
                name: r.first_name,
                days: {}
            };

            grouped[r.emp_code].days[date] ??= [];
            grouped[r.emp_code].days[date].push(r);
        });

        // Process each employee's attendance
        for (const emp in grouped) {
            const empData = grouped[emp];
            const sortedDates = Object.keys(empData.days).sort();

            for (const date of sortedDates) {
                const punches = empData.days[date];

                const inPunch = punches
                    .filter(p => p.terminal_alias === "In Device")
                    .sort((a, b) => a.punch_time - b.punch_time)[0];

                const outPunch = punches
                    .filter(p => p.terminal_alias === "Out Device")
                    .sort((a, b) => b.punch_time - a.punch_time)[0];

                let login = null, logout = null, workingHours = "0h 0m", workingMinutes = 0;
                let overtime = "0h 0m", overtimeMinutes = 0;

                if (inPunch && outPunch) {
                    // Convert Date objects to ISO strings and extract times
                    const inString = inPunch.punch_time.toISOString();
                    const outString = outPunch.punch_time.toISOString();
                    
                    login = inString.substring(11, 16); // HH:mm
                    logout = outString.substring(11, 16); // HH:mm

                    // Calculate working minutes
                    const inHour = parseInt(inString.substring(11, 13));
                    const inMin = parseInt(inString.substring(14, 16));
                    const outHour = parseInt(outString.substring(11, 13));
                    const outMin = parseInt(outString.substring(14, 16));
                    
                    const inTotalMins = inHour * 60 + inMin;
                    const outTotalMins = outHour * 60 + outMin;
                    
                    workingMinutes = outTotalMins - inTotalMins;
                    const hours = Math.floor(workingMinutes / 60);
                    const remainingMins = workingMinutes % 60;
                    workingHours = `${hours}h ${remainingMins}m`;

                    // Calculate overtime (after 18:30)
                    const officeEndMins = 18 * 60 + 30;
                    if (outTotalMins > officeEndMins) {
                        overtimeMinutes = outTotalMins - officeEndMins;
                        const otHours = Math.floor(overtimeMinutes / 60);
                        const otRemaining = overtimeMinutes % 60;
                        overtime = `${otHours}h ${otRemaining}m`;
                    }
                } else if (inPunch) {
                    const inString = inPunch.punch_time.toISOString();
                    login = inString.substring(11, 16);
                } else if (outPunch) {
                    const outString = outPunch.punch_time.toISOString();
                    logout = outString.substring(11, 16);
                }

                allAttendance.push({
                    emp_code: emp,
                    name: empData.name || "-",
                    date: date,
                    day: moment(date).format("ddd"),
                    login: login,
                    logout: logout,
                    workingHours: workingHours,
                    workingMinutes: workingMinutes,
                    overtime: overtime,
                    overtimeMinutes: overtimeMinutes,
                    status: (inPunch && outPunch) ? "Present" : (inPunch ? "Partial - No Logout" : (outPunch ? "Partial - No Login" : "Absent"))
                });
            }
        }

        res.json({
            success: true,
            startDate: start,
            endDate: end,
            totalRecords: allAttendance.length,
            attendance: allAttendance
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/* =======================
   DAY-WISE PDF REPORT
======================= */
app.get("/api/report/day", async (req, res) => {
    try {
        const date = req.query.date;
        if (!date) return res.status(400).json({ error: "Date required" });

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input("date", sql.Date, date)
            .query(`
                SELECT
                    t.emp_code,
                    e.first_name,
                    t.punch_time,
                    t.terminal_alias
                FROM geonetp.dbo.iclock_transaction t
                LEFT JOIN geonetp.dbo.personnel_employee e
                    ON t.emp_code = e.emp_code
                WHERE CAST(t.punch_time AS DATE) = @date
                ORDER BY t.emp_code, t.punch_time
            `);

        const attendance = processAttendance(result.recordset);

        const doc = new PDFDocument({ margin: 40, size: "A4" });
        const fileName = `Attendance_${date}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        doc.pipe(res);

        // Header
        doc.fontSize(18).text("Daily Attendance Report", { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(11).text(`Date: ${date}`, { align: "center" });
        doc.moveDown(2);

        // Table Header
        let y = doc.y;
        const x = 40;
        doc.font("Helvetica-Bold").fontSize(10);
        doc.text("Emp Code", x, y);
        doc.text("Name", x + 70, y);
        doc.text("Day", x + 180, y);
        doc.text("Login", x + 230, y);
        doc.text("Logout", x + 290, y);
        doc.text("Working", x + 350, y);
        doc.text("Overtime", x + 430, y);

        doc.moveDown();
        doc.font("Helvetica");

        attendance.forEach(emp => {
            y = doc.y;
            doc.text(emp.emp_code, x, y);
            doc.text(emp.name, x + 70, y);
            doc.text(emp.day, x + 180, y);
            doc.text(emp.login, x + 230, y);
            doc.text(emp.logout, x + 290, y);
            doc.text(emp.workingHours, x + 350, y);
            doc.text(emp.overtime, x + 430, y);
            doc.moveDown();
        });

        doc.end();

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


/* =======================
   WEEK-WISE PDF REPORT (FIXED)
======================= */
app.get("/api/report/week", async (req, res) => {
    try {
        const { start, end } = req.query;
        if (!start || !end) {
            return res.status(400).json({ error: "Start and End dates required" });
        }

        const pool = await sql.connect(config);

        const result = await pool.request()
            .input("start", sql.Date, start)
            .input("end", sql.Date, end)
            .query(`
                SELECT
                    t.emp_code,
                    e.first_name,
                    t.punch_time,
                    t.terminal_alias
                FROM geonetp.dbo.iclock_transaction t
                LEFT JOIN geonetp.dbo.personnel_employee e
                    ON t.emp_code = e.emp_code
                WHERE CAST(t.punch_time AS DATE) BETWEEN @start AND @end
                ORDER BY t.emp_code, t.punch_time
            `);

        // ---------------- GROUP DATA ----------------
        const grouped = {};

        result.recordset.forEach(r => {
            // Convert Date object to ISO string and extract date
            const isoString = r.punch_time.toISOString();
            const date = isoString.substring(0, 10); // YYYY-MM-DD

            grouped[r.emp_code] ??= {
                name: r.first_name,
                days: {}
            };

            grouped[r.emp_code].days[date] ??= [];
            grouped[r.emp_code].days[date].push(r);
        });

        // ---------------- PDF WITH LANDSCAPE ORIENTATION ----------------
        const doc = new PDFDocument({ 
            margin: 30, 
            size: "A4", 
            layout: "landscape" // This gives more horizontal space
        });
        
        const fileName = `Week_Attendance_${start}_to_${end}.pdf`
            .replace(/[^a-zA-Z0-9._-]/g, "");

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        doc.pipe(res);

        // Header
        doc.fontSize(18).text("Weekly Attendance Report", { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(11).text(`From ${start} To ${end}`, { align: "center" });
        doc.moveDown(1.5);

        // -------- Table Header with Better Layout --------
        const colX = [40, 90, 180, 280, 350, 420, 490, 570, 650];
        const colWidths = [50, 90, 100, 70, 70, 70, 80, 80, 80];
        
        let currentY = doc.y;
        
        // Header background
        doc.rect(35, currentY - 5, 700, 20).fillAndStroke("#4472C4", "#2E5090");
        
        // Header text
        const headers = ["Emp", "Name", "Date", "Day", "Login", "Logout", "Work", "OT"];
        doc.font("Helvetica-Bold").fontSize(10).fillColor("white");
        
        headers.forEach((h, i) => {
            doc.text(h, colX[i], currentY, { width: colWidths[i], align: "left" });
        });
        
        doc.moveDown(1.5);
        doc.fillColor("black");
        doc.font("Helvetica").fontSize(9);

        // -------- Table Rows with Proper Y Positioning --------
        let rowCount = 0;
        
        for (const emp in grouped) {
            const empData = grouped[emp];

            // Sort dates to show chronologically
            const sortedDates = Object.keys(empData.days).sort();

            for (const date of sortedDates) {
                const punches = empData.days[date];

                const inPunch = punches
                    .filter(p => p.terminal_alias === "In Device")
                    .sort((a, b) => a.punch_time - b.punch_time)[0];

                const outPunch = punches
                    .filter(p => p.terminal_alias === "Out Device")
                    .sort((a, b) => b.punch_time - a.punch_time)[0];

                let login = "-", logout = "-", work = "0h 0m", ot = "0h 0m";

                if (inPunch && outPunch) {
                    // Convert Date objects to ISO strings and extract times
                    const inString = inPunch.punch_time.toISOString();
                    const outString = outPunch.punch_time.toISOString();
                    
                    login = inString.substring(11, 16); // HH:mm
                    logout = outString.substring(11, 16); // HH:mm

                    // Calculate working time
                    const inHour = parseInt(inString.substring(11, 13));
                    const inMin = parseInt(inString.substring(14, 16));
                    const outHour = parseInt(outString.substring(11, 13));
                    const outMin = parseInt(outString.substring(14, 16));
                    
                    const inTotalMins = inHour * 60 + inMin;
                    const outTotalMins = outHour * 60 + outMin;
                    const mins = outTotalMins - inTotalMins;
                    
                    const hours = Math.floor(mins / 60);
                    const remainingMins = mins % 60;
                    work = `${hours}h ${remainingMins}m`;

                    // Calculate overtime (after 18:30)
                    const officeEndMins = 18 * 60 + 30;
                    if (outTotalMins > officeEndMins) {
                        const otMins = outTotalMins - officeEndMins;
                        const otHours = Math.floor(otMins / 60);
                        const otRemaining = otMins % 60;
                        ot = `${otHours}h ${otRemaining}m`;
                    }
                } else if (inPunch) {
                    // Only login available
                    const inString = inPunch.punch_time.toISOString();
                    login = inString.substring(11, 16);
                } else if (outPunch) {
                    // Only logout available
                    const outString = outPunch.punch_time.toISOString();
                    logout = outString.substring(11, 16);
                }

                // Check if we need a new page
                if (doc.y > 520) {
                    doc.addPage();
                    currentY = doc.y;
                    
                    // Redraw header on new page
                    doc.rect(35, currentY - 5, 700, 20).fillAndStroke("#4472C4", "#2E5090");
                    doc.font("Helvetica-Bold").fontSize(10).fillColor("white");
                    headers.forEach((h, i) => {
                        doc.text(h, colX[i], currentY, { width: colWidths[i], align: "left" });
                    });
                    doc.moveDown(1.5);
                    doc.fillColor("black");
                    doc.font("Helvetica").fontSize(9);
                    rowCount = 0; // Reset row count for alternating colors
                }

                const row = [
                    emp,
                    empData.name || "-",
                    date,
                    moment(date).format("ddd"),
                    login,
                    logout,
                    work,
                    ot
                ];

                // Store the Y position for this row BEFORE any text operations
                currentY = doc.y;
                
                // Alternate row colors for better readability
                if (rowCount % 2 === 0) {
                    doc.rect(35, currentY - 3, 700, 16).fillAndStroke("#F2F2F2", "#E0E0E0");
                }

                // Draw each column at the SAME Y position
                row.forEach((val, i) => {
                    doc.fillColor("black").text(val, colX[i], currentY, { 
                        width: colWidths[i], 
                        align: "left",
                        continued: false // Important: don't continue to next column
                    });
                });

                // Move to next row
                doc.moveDown(0.8);
                rowCount++;
            }
        }

        doc.end();

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});



/* =======================
   SERVER START
======================= */
app.listen(5000, () => {
    console.log("🚀 Server running on http://localhost:5000");
});