"""
Tests for products CRUD endpoints.
Tests creating, reading, updating, and deleting products.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product


class TestProductCreation:
    """Test cases for creating products."""

    @pytest.mark.asyncio
    async def test_create_product_as_admin(self, client: AsyncClient, admin_token: str):
        """Test admin can create a new product."""
        response = await client.post(
            "/api/products/",
            json={
                "sku": "PROD-001",
                "name": "New Product",
                "category": "Electronics",
                "cost_price": 100.00,
                "sell_price": 150.00,
                "min_stock_level": 10,
                "unit": "pcs"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 201
        data = response.json()
        assert data["sku"] == "PROD-001"
        assert data["name"] == "New Product"
        assert float(data["cost_price"]) == 100.00
        assert float(data["sell_price"]) == 150.00
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_product_duplicate_sku(
        self, client: AsyncClient, admin_token: str, sample_product: Product
    ):
        """Test creating product with duplicate SKU fails."""
        response = await client.post(
            "/api/products/",
            json={
                "sku": "TEST-001",
                "name": "Duplicate SKU",
                "category": "Test",
                "cost_price": 50.00,
                "sell_price": 75.00,
                "min_stock_level": 5,
                "unit": "pcs"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_create_product_invalid_prices(self, client: AsyncClient, admin_token: str):
        """Test creating product with invalid prices fails."""
        response = await client.post(
            "/api/products/",
            json={
                "sku": "INVALID-001",
                "name": "Invalid Product",
                "category": "Test",
                "cost_price": -10.00,
                "sell_price": 150.00,
                "min_stock_level": 10,
                "unit": "pcs"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_product_without_auth(self, client: AsyncClient):
        """Test creating product without authentication fails."""
        response = await client.post(
            "/api/products/",
            json={
                "sku": "NOAUTH-001",
                "name": "No Auth Product",
                "category": "Test",
                "cost_price": 100.00,
                "sell_price": 150.00,
                "min_stock_level": 10,
                "unit": "pcs"
            }
        )
        assert response.status_code == 403  # HTTPBearer ส่งคืน 403 เมื่อไม่มีการระบุการตรวจสอบสิทธิ์


class TestProductRetrieval:
    """Test cases for retrieving products."""

    @pytest.mark.asyncio
    async def test_get_all_products(
        self, client: AsyncClient, admin_token: str, sample_product: Product
    ):
        """Test retrieving all products."""
        response = await client.get(
            "/api/products/",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert data[0]["sku"] == "TEST-001"

    @pytest.mark.asyncio
    async def test_get_product_by_id(
        self, client: AsyncClient, admin_token: str, sample_product: Product
    ):
        """Test retrieving a specific product by ID."""
        response = await client.get(
            f"/api/products/{sample_product.id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_product.id
        assert data["sku"] == "TEST-001"
        assert data["name"] == "Test Product"

    @pytest.mark.asyncio
    async def test_get_nonexistent_product(self, client: AsyncClient, admin_token: str):
        """Test retrieving non-existent product returns 404."""
        response = await client.get(
            "/api/products/99999",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_search_products_by_sku(
        self, client: AsyncClient, admin_token: str, sample_product: Product
    ):
        """Test searching products by SKU."""
        response = await client.get(
            "/api/products/?search=TEST",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert any(p["sku"] == "TEST-001" for p in data)


class TestProductUpdate:
    """Test cases for updating products."""

    @pytest.mark.asyncio
    async def test_update_product(
        self, client: AsyncClient, admin_token: str, sample_product: Product
    ):
        """Test admin can update a product."""
        response = await client.put(
            f"/api/products/{sample_product.id}",
            json={
                "sku": "TEST-001",
                "name": "Updated Product Name",
                "category": "Electronics",
                "cost_price": 120.00,
                "sell_price": 180.00,
                "min_stock_level": 15,
                "unit": "pcs"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Product Name"
        assert float(data["cost_price"]) == 120.00
        assert float(data["sell_price"]) == 180.00

    @pytest.mark.asyncio
    async def test_update_product_sku_conflict(
        self, client: AsyncClient, admin_token: str, db_session: AsyncSession
    ):
        """Test updating product SKU to existing SKU fails."""
        # Create two products
        product1 = Product(
            sku="PROD-A",
            name="Product A",
            category="Test",
            cost_price=100,
            sell_price=150,
            min_stock_level=10,
            unit="pcs"
        )
        product2 = Product(
            sku="PROD-B",
            name="Product B",
            category="Test",
            cost_price=100,
            sell_price=150,
            min_stock_level=10,
            unit="pcs"
        )
        db_session.add(product1)
        db_session.add(product2)
        await db_session.commit()
        await db_session.refresh(product1)
        await db_session.refresh(product2)

        # Try to update product2's SKU to product1's SKU
        response = await client.put(
            f"/api/products/{product2.id}",
            json={
                "sku": "PROD-A",
                "name": "Product B",
                "category": "Test",
                "cost_price": 100,
                "sell_price": 150,
                "min_stock_level": 10,
                "unit": "pcs"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_update_nonexistent_product(self, client: AsyncClient, admin_token: str):
        """Test updating non-existent product returns 404."""
        response = await client.put(
            "/api/products/99999",
            json={
                "sku": "NOTFOUND-001",
                "name": "Not Found",
                "category": "Test",
                "cost_price": 100,
                "sell_price": 150,
                "min_stock_level": 10,
                "unit": "pcs"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404


class TestProductDeletion:
    """Test cases for deleting products."""

    @pytest.mark.asyncio
    async def test_delete_product(
        self, client: AsyncClient, admin_token: str, sample_product: Product
    ):
        """Test admin can delete a product."""
        response = await client.delete(
            f"/api/products/{sample_product.id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 204

        # Verify product is deleted
        get_response = await client.get(
            f"/api/products/{sample_product.id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_nonexistent_product(self, client: AsyncClient, admin_token: str):
        """Test deleting non-existent product returns 404."""
        response = await client.delete(
            "/api/products/99999",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 404


class TestProductValidation:
    """Test cases for product data validation."""

    @pytest.mark.asyncio
    async def test_product_price_validation(self, client: AsyncClient, admin_token: str):
        """Test that sell price should typically be higher than cost price."""
        # หมายเหตุ: นี่คือกฎทางธุรกิจที่อาจต้องบังคับใช้
        response = await client.post(
            "/api/products/",
            json={
                "sku": "LOSS-001",
                "name": "Loss Making Product",
                "category": "Test",
                "cost_price": 150.00,
                "sell_price": 100.00,  # ขายต่ำกว่าทุน
                "min_stock_level": 10,
                "unit": "pcs"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        # ปัจจุบันควรจะสำเร็จ แต่อาจต้องการเพิ่มคำเตือน
        # อัปเดต: โค้ดบังคับใช้การตรวจสอบที่เข้มงวด (422 Unprocessable Entity)
        assert response.status_code == 422


    @pytest.mark.asyncio
    async def test_product_min_stock_level_positive(self, client: AsyncClient, admin_token: str):
        """Test that min_stock_level must be positive."""
        response = await client.post(
            "/api/products/",
            json={
                "sku": "NEG-001",
                "name": "Negative Min Stock",
                "category": "Test",
                "cost_price": 100.00,
                "sell_price": 150.00,
                "min_stock_level": -5,
                "unit": "pcs"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 422