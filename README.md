# 🍰 Cafe QR Code Ordering System - Learning Project

A comprehensive full-stack restaurant table ordering system built with Next.js and Express, designed as a hands-on project to learn and master modern web development technologies. Through building this QR-driven ordering experience, you'll gain practical experience with React, TypeScript, Node.js, PostgreSQL, and various integrations like payment processing and SMS notifications.

---

## 📋 Table of Contents

- [Learning Objectives](#learning-objectives)
- [What is this project?](#what-is-this-project)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [NPM Scripts](#npm-scripts)
- [Learning Path](#learning-path)
- [Notes](#notes)

---

## 🎯 Learning Objectives

This project serves as a practical learning platform to master:

- **Frontend Development**: React hooks, component architecture, state management, and responsive design
- **Backend Development**: RESTful API design, middleware implementation, and server-side logic
- **Database Management**: PostgreSQL queries, migrations, and data modeling
- **Authentication & Security**: JWT implementation and secure API practices
- **Third-Party Integrations**: Payment processing (Razorpay), SMS notifications (Twilio), and email services
- **Full-Stack Architecture**: Connecting frontend and backend, handling real-time updates
- **TypeScript**: Type-safe development across the entire stack
- **Modern Tooling**: Build tools, package management, and development workflows

---

## ❓ What is this project?

This project provides a QR-driven ordering experience for cafes and restaurants, serving as a real-world application to practice full-stack development:

- Customers scan a table-specific QR code
- Browse the menu and add items to a cart
- Place orders and follow order progress
- Kitchen staff view active orders and update status
- Admins manage menu, tables, coupons, and offers
- Payments are handled via Razorpay
- SMS notifications are sent via Twilio

Each feature is implemented to demonstrate best practices and common patterns in modern web development.

---

## ❓ What is this project?

This project provides a QR-driven ordering experience for cafes and restaurants:

- Customers scan a table-specific QR code
- Browse the menu and add items to a cart
- Place orders and follow order progress
- Kitchen staff view active orders and update status
- Admins manage menu, tables, coupons, and offers
- Payments are handled via Razorpay
- SMS notifications are sent via Twilio

---

## ✅ Features

- Customer-facing menu and cart flow
- Order placement and tracking
- Kitchen dashboard for active orders
- Admin authentication and management
- Table QR code support
- Razorpay payment integration
- Twilio SMS notifications
- Coupon and offer management

---

## 🛠️ Tech Stack

### Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS

### Backend
- Express.js
- TypeScript
- PostgreSQL
- JWT authentication
- Razorpay payments
- Twilio SMS
- Nodemailer email support

---

## 📁 Project Structure

```
cafe-qr-code/
├── app/                          # Next.js frontend app
├── components/                   # React UI components
├── hooks/                        # Custom React hooks
├── lib/                          # Frontend utilities
├── public/                       # Static assets
├── server/                       # Express backend
│   ├── src/
│   │   ├── db/                   # PostgreSQL connection and migrations
│   │   ├── middleware/           # Auth and validation middleware
│   │   ├── routes/               # API route handlers
│   │   └── services/             # Email and SMS helpers
├── types/                        # Shared TypeScript types
├── package.json                  # Frontend root package
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

---

## 🚀 Setup & Installation

### Prerequisites

- Node.js v18+
- npm
- PostgreSQL v12+

### Backend Setup

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your database credentials, JWT secret, Razorpay, and Twilio settings
npm run migrate
npm run dev
```

The backend runs on `http://localhost:5000` by default.

### Frontend Setup

```bash
cd ..
npm install
npm run dev
```

The frontend runs on `http://localhost:3000`.

---

## 📡 API Endpoints

Base URL: `http://localhost:5000/api`

### Auth
- `POST /auth/login` — Admin login
- `POST /auth/register` — Admin registration
- `POST /auth/logout` — Admin logout

### Menu
- `GET /menu` — Get categories with items
- `GET /menu/categories` — Get categories
- `GET /menu/items` — Get menu items
- `GET /menu/items/:id` — Get menu item
- `POST /menu/categories` — Create category (admin)
- `PUT /menu/categories/:id` — Update category (admin)
- `DELETE /menu/categories/:id` — Delete category (admin)
- `POST /menu/items` — Create item (admin)
- `PUT /menu/items/:id` — Update item (admin)
- `DELETE /menu/items/:id` — Delete item (admin)

### Tables
- `GET /tables` — Get all tables
- `POST /tables` — Create table
- `GET /tables/:id` — Get table details with QR code

### Orders
- `POST /orders` — Create order
- `GET /orders/:id` — Get order details
- `PUT /orders/:id/status` — Update order status

### Kitchen
- `GET /kitchen/orders` — Get active kitchen orders
- `PUT /kitchen/orders/:id/status` — Update kitchen order status

### Payments
- `POST /payments/create` — Initiate payment
- `POST /payments/webhook` — Razorpay webhook endpoint

### Coupons
- `GET /coupons` — Get active coupons
- `POST /coupons` — Create coupon (admin)
- `PUT /coupons/:id` — Update coupon
- `DELETE /coupons/:id` — Delete coupon

### Offers
- `GET /offers` — Get active offers
- `POST /offers` — Create offer (admin)
- `PUT /offers/:id` — Update offer
- `DELETE /offers/:id` — Delete offer

---

## ⚙️ Environment Variables

Copy `.env.example` to `server/.env` and set values for:

```env
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cafe_db
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_secret_key_here
JWT_EXPIRY=7d
FRONTEND_URL=http://localhost:3000
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890
RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
```

---

## �️ Learning Path

Follow this structured approach to build and understand the project:

### Phase 1: Frontend Fundamentals
1. Set up Next.js project structure
2. Implement basic routing and layouts
3. Create reusable components with TypeScript
4. Style with Tailwind CSS
5. Add state management with React hooks

### Phase 2: Backend Basics
1. Set up Express server with TypeScript
2. Create database schema and migrations
3. Implement basic CRUD operations
4. Add authentication middleware
5. Connect frontend to backend APIs

### Phase 3: Advanced Features
1. Integrate payment processing (Razorpay)
2. Add SMS notifications (Twilio)
3. Implement real-time order updates
4. Add admin authentication and management
5. Deploy and monitor the application

### Phase 4: Best Practices
1. Add comprehensive error handling
2. Implement logging and monitoring
3. Write unit and integration tests
4. Optimize performance and security
5. Document APIs and code

Each phase includes hands-on implementation of real-world features, helping you master the technologies through practical application.

---

## 💡 Notes

- Frontend and backend run separately.
- Admin panel is under `app/admin`.
- Customer menu is served from `app/menu/[tableId]`.
- Order tracking is under `app/order/[orderId]`.
