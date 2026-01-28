import express from 'express';
import mysql from 'mysql2';
import {
    getProducts, getProductid, getCustomers, getDepartment,
    getShoppingCart, getShoppingCartItem, getOrders, getOrderItem,
    addProduct, deleteProduct, searchProducts, browseByDepartment,
    addToCart, removeFromCart, checkout, getOrderHistory,
    restockProduct
} from './database.js';

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'xXNoobSlayerXx',
    database: 'departmental_store'
}).promise();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ---------------- BASIC ROUTES ----------------
app.get("/mart/products", async (req, res) => res.json(await getProducts()));
app.get("/mart/products/:id", async (req, res) => res.json(await getProductid(req.params.id)));
app.get("/mart/customers", async (req, res) => res.json(await getCustomers()));
app.get("/mart/department", async (req, res) => res.json(await getDepartment()));
app.get("/mart/shoppingcart", async (req, res) => res.json(await getShoppingCart()));
app.get("/mart/shoppingcartitem", async (req, res) => {
    const customerId = req.query.customerId || 1;
    const [cart] = await pool.query(
        `SELECT ShoppingCartID FROM ShoppingCart WHERE CustomerID = ?`,
        [customerId]
    );

    if (cart.length === 0) {
        return res.json([]);
    }

    const [items] = await pool.query(
        `SELECT * FROM ShoppingCartItem WHERE ShoppingCartID = ?`,
        [cart[0].ShoppingCartID]
    );

    res.json(items);
});
app.get("/mart/orders", async (req, res) => res.json(await getOrders()));
app.get("/mart/orderitem", async (req, res) => res.json(await getOrderItem()));

// ---------------- ADMIN ROUTES ----------------
app.delete("/mart/products/:id", async (req, res) => {
    await deleteProduct(req.params.id);
    res.json({ message: "Product deleted" });
});

app.get("/mart/products/search", async (req, res) => {
    const { department, category, brand } = req.query;
    res.json(await searchProducts({ department, category, brand }));
});

app.post("/mart/products/restock", async (req, res) => {
    const { productId, quantity } = req.body;
    try {
        await restockProduct(productId, quantity);
        res.json({ message: `Product ID ${productId} restocked by ${quantity}` });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ---------------- CUSTOMER ROUTES ----------------
app.get("/mart/browse/department/:name", async (req, res) => res.json(await browseByDepartment(req.params.name)));

app.get("/mart/cart/add", async (req, res) => {
    const customerId = req.query.customerId;
    const productId = req.query.productId;
    const qty = parseInt(req.query.qty);
    try {
        const result = await addToCart(customerId, productId, qty);
        res.json({ message: "Added to cart", cartId: result.cartId });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.delete("/mart/cart/remove", async (req, res) => {
    const customerId = req.query.customerId;
    const productId = req.query.productId;
    try {
        await removeFromCart(customerId, productId);
        res.json({ message: "Removed from cart" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post("/mart/checkout", async (req, res) => {
    const { customerId, firstName, lastName, address, phoneNumber } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !address || !phoneNumber) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        const result = await checkout(customerId);

        // You can log or store customer info here
        console.log(`Order placed by: ${firstName} ${lastName}`);
        console.log(`Address: ${address}`);
        console.log(`Phone: ${phoneNumber}`);

        res.json({
            orderID: result,
            firstName,
            lastName,
            address,
            phoneNumber
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get("/mart/orders/history/:customerId", async (req, res) => {
    res.json(await getOrderHistory(req.params.customerId));
});

// ---------------- SERVER INIT ----------------
app.listen(8000, () => {
    console.log("Server running at http://localhost:8000");
});