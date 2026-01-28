import mysql from 'mysql2';

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'xXNoobSlayerXx',
    database: 'departmental_store'
}).promise();

// ---------------- BASIC READ FUNCTIONS ----------------
export async function getProducts() {
    const [rows] = await pool.query("SELECT * FROM Products");
    return rows;
}

export async function getProductid(id) {
    const [rows] = await pool.query("SELECT * FROM Products WHERE ProductID = ?", [id]);
    return rows;
}

export async function getCustomers() {
    const [rows] = await pool.query("SELECT * FROM Customer");
    return rows;
}

export async function getDepartment() {
    const [rows] = await pool.query("SELECT * FROM Department");
    return rows;
}

export async function getShoppingCart() {
    const [rows] = await pool.query("SELECT * FROM ShoppingCart");
    return rows;
}

export async function getShoppingCartItem() {
    const [rows] = await pool.query("SELECT * FROM ShoppingCartItem");
    return rows;
}

export async function getOrders() {
    const [rows] = await pool.query("SELECT * FROM Orders");
    return rows;
}

export async function getOrderItem() {
    const [rows] = await pool.query("SELECT * FROM OrderItem");
    return rows;
}

// ---------------- PRODUCT MANAGEMENT ----------------
export async function addProduct(name, deptId, category, brand, qty, expiry=null) {
    const sql = `
        INSERT INTO Products (ProductName, DepartmentID, Category, Brand, QuantityInStock, ExpiryDate)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    const [res] = await pool.query(sql, [name, deptId, category, brand, qty, expiry]);
    return res.insertId;
}

export async function deleteProduct(id) {
    const sql = `DELETE FROM Products WHERE ProductID = ?`;
    const [res] = await pool.query(sql, [id]);
    return res.affectedRows;
}

export async function searchProducts({ department, category, brand }) {
    let sql = `SELECT * FROM Products WHERE 1=1`;
    const params = [];
    if (department) { sql += ` AND DepartmentID = ?`; params.push(department); }
    if (category) { sql += ` AND Category = ?`; params.push(category); }
    if (brand) { sql += ` AND Brand = ?`; params.push(brand); }
    const [rows] = await pool.query(sql, params);
    return rows;
}

export async function browseByDepartment(name) {
    const sql = `
        SELECT * FROM Products p
                          JOIN Department d ON p.DepartmentID = d.DepartmentID
        WHERE d.DepartmentName = ?
    `;
    const [rows] = await pool.query(sql, [name]);
    return rows;
}

// ---------------- CART FUNCTIONS ----------------
export async function addToCart(customerId, productId, qty) {
    const [productRows] = await pool.query(
        `SELECT QuantityInStock FROM Products WHERE ProductID = ?`,
        [productId]
    );
    if (productRows.length === 0) throw new Error("Product not found");

    const stock = productRows[0].QuantityInStock;
    if (stock < qty) throw new Error(`Only ${stock} left in stock`);

    const [cart] = await pool.query(
        `SELECT ShoppingCartID FROM ShoppingCart WHERE CustomerID = ?`,
        [customerId]
    );

    let cartId;
    if (cart.length === 0) {
        const [result] = await pool.query(
            `INSERT INTO ShoppingCart (CustomerID) VALUES (?)`,
            [customerId]
        );
        cartId = result.insertId;
    } else {
        cartId = cart[0].ShoppingCartID;
    }

    await pool.query(
        `INSERT INTO ShoppingCartItem (ShoppingCartID, ProductID, Quantity)
         VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE Quantity = Quantity + VALUES(Quantity)`,
        [cartId, productId, qty]
    );

    await pool.query(
        `UPDATE Products SET QuantityInStock = QuantityInStock - ? WHERE ProductID = ?`,
        [qty, productId]
    );

    return { cartId };
}

export async function removeFromCart(customerId, productId) {
    const [cart] = await pool.query(
        `SELECT ShoppingCartID FROM ShoppingCart WHERE CustomerID = ?`,
        [customerId]
    );
    if (cart.length === 0) throw new Error("Cart not found");

    const [itemRows] = await pool.query(
        `SELECT Quantity FROM ShoppingCartItem WHERE ShoppingCartID = ? AND ProductID = ?`,
        [cart[0].ShoppingCartID, productId]
    );
    if (itemRows.length === 0) throw new Error("Item not found in cart");
    const qtyToReturn = itemRows[0].Quantity;

    await pool.query(
        `DELETE FROM ShoppingCartItem WHERE ShoppingCartID = ? AND ProductID = ?`,
        [cart[0].ShoppingCartID, productId]
    );

    await pool.query(
        `UPDATE Products SET QuantityInStock = QuantityInStock + ? WHERE ProductID = ?`,
        [qtyToReturn, productId]
    );
}

// ---------------- MANUAL RESTOCK ----------------
export async function restockProduct(productId, quantity) {
    if (!productId || !quantity || quantity <= 0) {
        throw new Error("Invalid productId or quantity");
    }

    await pool.query(
        `UPDATE Products SET QuantityInStock = QuantityInStock + ? WHERE ProductID = ?`,
        [quantity, productId]
    );
}

// ---------------- ORDER FUNCTIONS ----------------
export async function getOrderHistory(customerId) {
    const sql = `
        SELECT o.OrderID, o.OrderDate, o.TotalAmount, p.ProductName, i.Quantity, i.Price
        FROM Orders o
                 JOIN OrderItem i ON o.OrderID = i.OrderID
                 JOIN Products p ON i.ProductID = p.ProductID
        WHERE o.CustomerID = ?
        ORDER BY o.OrderDate DESC
    `;
    const [rows] = await pool.query(sql, [customerId]);
    return rows;
}

export async function checkout(customerId) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[cart]] = await conn.query(
            `SELECT ShoppingCartID FROM ShoppingCart WHERE CustomerID = ?`,
            [customerId]
        );
        if (!cart) throw new Error("Cart not found");

        const [items] = await conn.query(
            `SELECT ProductID, Quantity FROM ShoppingCartItem WHERE ShoppingCartID = ?`,
            [cart.ShoppingCartID]
        );
        if (items.length === 0) throw new Error("Cart empty");

        let total = 0;

        const [orderRes] = await conn.query(
            `INSERT INTO Orders (CustomerID, OrderDate, TotalAmount) VALUES (?, CURDATE(), 0)`,
            [customerId]
        );
        const orderId = orderRes.insertId;

        for (const item of items) {
            const price = 100; // Placeholder price
            total += price * item.Quantity;

            await conn.query(
                `INSERT INTO OrderItem (OrderID, ProductID, Quantity, Price) VALUES (?, ?, ?, ?)`,
                [orderId, item.ProductID, item.Quantity, price]
            );
        }

        await conn.query(`UPDATE Orders SET TotalAmount = ? WHERE OrderID = ?`, [total, orderId]);
        await conn.query(`DELETE FROM ShoppingCartItem WHERE ShoppingCartID = ?`, [cart.ShoppingCartID]);
        await conn.commit();
        return orderId;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}
