# Shehersaaz IMS

Inventory Management System built with HTML, CSS, vanilla JavaScript, Node.js, Express, and MySQL.

## Project Structure

```text
IMS/
  backend/
    server.js
    package.json
    routes/
    controllers/
    middleware/
    config/
    services/
    utils/
    sql/
    uploads/
  frontend/
    index.html
    css/
    js/
    assets/
    requests/
    inventory/
    procurement/
    grn/
    admin/
    print/
```

Root `package.json` is kept as a convenience launcher so the app can be installed and started from the project root.

## Environment

Create `.env` in the project root:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=ims_system
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
PORT=3000
```

`.env` is ignored by git. Keep real credentials out of commits.

## Database Setup

1. Create a MySQL database named in `DB_NAME`.
2. Import `IMS/backend/sql/ims_system_schema.sql`.
3. Confirm the user in `.env` has access to that database.

## Run Locally

```bash
npm install
npm start
```

For development:

```bash
npm run dev
```

The app serves the frontend from `IMS/frontend` and exposes backend APIs under `/api`.

## Backend Notes

- Database access is centralized in `IMS/backend/config/database.js`.
- Settings APIs are grouped under `IMS/backend/routes/settingsRoutes.js`.
- Controller logic lives in `IMS/backend/controllers`.
- Database write logic lives in `IMS/backend/services`.
- Shared middleware handles CORS, 404 responses, and server errors.

## Main API

- `GET /api/health`
- `GET /api/settings`
- `GET /api/settings/:group`
- `PUT /api/settings/:group`
- `PUT /api/settings/:group/:key`
- `GET|POST /api/requests`
- `GET|POST /api/items`
- `GET|POST /api/vendors`
- `GET|POST /api/purchase-orders`
- `GET|POST /api/grn`
- `GET /api/inventory`
- `POST /api/stock/in/manual`
- `POST /api/stock/out`
- `GET /api/audit`
