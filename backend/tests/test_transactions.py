"""
Tests for transaction endpoints and inventory management.
Tests INBOUND (receiving) and OUTBOUND (shipping) transactions with automatic inventory updates.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.product import Product
from app.models.inventory import Inventory, InventoryStatus
from app.models.transaction import Transaction, TransactionType


class TestInboundTransactions:
    """Test cases for INBOUND (receiving) transactions."""

    @pytest.mark.asyncio
    async def test_create_inbound_transaction(
        self,
        client: AsyncClient,
        admin_token: str,
        sample_product: Product,
        sample_inventory: Inventory,
        db_session: AsyncSession
    ):
        """Test creating an inbound transaction increases inventory."""
        initial_quantity = sample_inventory.quantity

        response = await client.post(
            "/api/transactions/",
            json={
                "product_id": sample_product.id,
                "type": "INBOUND",
                "quantity": 20,
                "location": "A-01",
                "notes": "Receiving new stock"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        assert response.status_code == 201
        data = response.json()
        assert data["type"] == "INBOUND"
        assert data["quantity"] == 20
        assert float(data["unit_price"]) == float(sample_product.cost_price)

        # ตรวจสอบว่ามีการอัปเดตสินค้าคงคลัง
        await db_session.refresh(sample_inventory)
        assert sample_inventory.quantity == initial_quantity + 20

    @pytest.mark.asyncio
    async def test_inbound_uses_cost_price(
        self,
        client: AsyncClient,
        admin_token: str,
        sample_product: Product,
        sample_inventory: Inventory
    ):
        """Test that inbound transactions use cost_price."""
        response = await client.post(
            "/api/transactions/",
            json={
                "product_id": sample_product.id,
                "type": "INBOUND",
                "quantity": 10,
                "location": "A-01"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        assert response.status_code == 201
        data = response.json()
        assert float(data["unit_price"]) == float(sample_product.cost_price)
        assert float(data["total_price"]) == float(sample_product.cost_price * 10)

    @pytest.mark.asyncio
    async def test_inbound_updates_stock_status(
        self,
        client: AsyncClient,
        admin_token: str,
        db_session: AsyncSession
    ):
        """Test that inbound transaction updates stock status from LOW_STOCK to IN_STOCK."""
        # สร้างสินค้าที่มีสต็อกต่ำ
        product = Product(
            sku="LOW-001",
            name="Low Stock Product",
            category="Test",
            cost_price=100,
            sell_price=150,
            min_stock_level=50,
            unit="pcs"
        )
        db_session.add(product)
        await db_session.commit()
        await db_session.refresh(product)

        # สร้างสินค้าคงคลังที่มีสต็อกต่ำ
        inventory = Inventory(
            product_id=product.id,
            quantity=20,  # ต่ำกว่าระดับสต็อกขั้นต่ำที่ 50
            location="A-01",
            status=InventoryStatus.LOW_STOCK
        )
        db_session.add(inventory)
        await db_session.commit()

        # เพิ่มธุรกรรมขาเข้าเพื่อนำสต็อกให้สูงกว่าขั้นต่ำ
        response = await client.post(
            "/api/transactions/",
            json={
                "product_id": product.id,
                "type": "INBOUND",
                "quantity": 50,
                "location": "A-01"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        assert response.status_code == 201

        # ตรวจสอบสถานะเปลี่ยนเป็น IN_STOCK
        await db_session.refresh(inventory)
        assert inventory.quantity == 70
        assert inventory.status == InventoryStatus.IN_STOCK


class TestOutboundTransactions:
    """Test cases for OUTBOUND (shipping) transactions."""

    @pytest.mark.asyncio
    async def test_create_outbound_transaction(
        self,
        client: AsyncClient,
        admin_token: str,
        sample_product: Product,
        sample_inventory: Inventory,
        db_session: AsyncSession
    ):
        """Test creating an outbound transaction decreases inventory."""
        initial_quantity = sample_inventory.quantity

        response = await client.post(
            "/api/transactions/",
            json={
                "product_id": sample_product.id,
                "type": "OUTBOUND",
                "quantity": 15,
                "location": "A-01",
                "notes": "Shipping to customer"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        assert response.status_code == 201
        data = response.json()
        assert data["type"] == "OUTBOUND"
        assert data["quantity"] == 15
        assert float(data["unit_price"]) == float(sample_product.sell_price)

        # ตรวจสอบว่ามีการอัปเดตสินค้าคงคลัง
        await db_session.refresh(sample_inventory)
        assert sample_inventory.quantity == initial_quantity - 15

    @pytest.mark.asyncio
    async def test_outbound_uses_sell_price(
        self,
        client: AsyncClient,
        admin_token: str,
        sample_product: Product,
        sample_inventory: Inventory
    ):
        """Test that outbound transactions use sell_price."""
        response = await client.post(
            "/api/transactions/",
            json={
                "product_id": sample_product.id,
                "type": "OUTBOUND",
                "quantity": 10,
                "location": "A-01"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        assert response.status_code == 201
        data = response.json()
        assert float(data["unit_price"]) == float(sample_product.sell_price)
        assert float(data["total_price"]) == float(sample_product.sell_price * 10)

    @pytest.mark.asyncio
    async def test_outbound_insufficient_stock(
        self,
        client: AsyncClient,
        admin_token: str,
        sample_product: Product,
        sample_inventory: Inventory
    ):
        """Test that outbound transaction fails when insufficient stock."""
        response = await client.post(
            "/api/transactions/",
            json={
                "product_id": sample_product.id,
                "type": "OUTBOUND",
                "quantity": 1000,  # More than available
                "location": "A-01"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        assert response.status_code == 400
        assert "insufficient" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_outbound_updates_to_low_stock(
        self,
        client: AsyncClient,
        admin_token: str,
        sample_product: Product,
        sample_inventory: Inventory,
        db_session: AsyncSession
    ):
        """Test that outbound transaction updates status to LOW_STOCK when below minimum."""
        # Sample inventory has 50, min_stock_level is 10
        # Ship 45 to bring it to 5 (below minimum)
        response = await client.post(
            "/api/transactions/",
            json={
                "product_id": sample_product.id,
                "type": "OUTBOUND",
                "quantity": 45,
                "location": "A-01"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        assert response.status_code == 201

        # Verify status changed to LOW_STOCK
        await db_session.refresh(sample_inventory)
        assert sample_inventory.quantity == 5
        assert sample_inventory.status == InventoryStatus.LOW_STOCK

    @pytest.mark.asyncio
    async def test_outbound_updates_to_out_of_stock(
        self,
        client: AsyncClient,
        admin_token: str,
        sample_product: Product,
        sample_inventory: Inventory,
        db_session: AsyncSession
    ):
        """Test that outbound transaction updates status to OUT_OF_STOCK when quantity reaches 0."""
        # Ship all available stock
        response = await client.post(
            "/api/transactions/",
            json={
                "product_id": sample_product.id,
                "type": "OUTBOUND",
                "quantity": sample_inventory.quantity,
                "location": "A-01"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        assert response.status_code == 201

        # Verify status changed to OUT_OF_STOCK
        await db_session.refresh(sample_inventory)
        assert sample_inventory.quantity == 0
        assert sample_inventory.status == InventoryStatus.OUT_OF_STOCK


class TestTransactionRetrieval:
    """Test cases for retrieving transactions."""

    @pytest.mark.asyncio
    async def test_get_all_transactions(
        self,
        client: AsyncClient,
        admin_token: str,
        sample_product: Product,
        sample_inventory: Inventory
    ):
        """Test retrieving all transactions."""
        # Create a transaction first
        await client.post(
            "/api/transactions/",
            json={
                "product_id": sample_product.id,
                "type": "INBOUND",
                "quantity": 10,
                "location": "A-01"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        response = await client.get(
            "/api/transactions/",
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    @pytest.mark.asyncio
    async def test_get_transactions_by_product(
        self,
        client: AsyncClient,
        admin_token: str,
        sample_product: Product,
        sample_inventory: Inventory
    ):
        """Test filtering transactions by product_id."""
        # Create transactions for this product
        await client.post(
            "/api/transactions/",
            json={
                "product_id": sample_product.id,
                "type": "INBOUND",
                "quantity": 10,
                "location": "A-01"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        response = await client.get(
            f"/api/transactions/?product_id={sample_product.id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert all(t["product_id"] == sample_product.id for t in data)

    @pytest.mark.asyncio
    async def test_get_transactions_by_type(
        self,
        client: AsyncClient,
        admin_token: str,
        sample_product: Product,
        sample_inventory: Inventory
    ):
        """Test filtering transactions by type."""
        # Create inbound and outbound transactions
        await client.post(
            "/api/transactions/",
            json={
                "product_id": sample_product.id,
                "type": "INBOUND",
                "quantity": 10,
                "location": "A-01"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        await client.post(
            "/api/transactions/",
            json={
                "product_id": sample_product.id,
                "type": "OUTBOUND",
                "quantity": 5,
                "location": "A-01"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        # Get only INBOUND transactions
        response = await client.get(
            "/api/transactions/?type=INBOUND",
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        assert response.status_code == 200
        data = response.json()
        assert all(t["type"] == "INBOUND" for t in data)


class TestTransactionValidation:
    """Test cases for transaction data validation."""

    @pytest.mark.asyncio
    async def test_transaction_requires_positive_quantity(
        self,
        client: AsyncClient,
        admin_token: str,
        sample_product: Product
    ):
        """Test that transaction quantity must be positive."""
        response = await client.post(
            "/api/transactions/",
            json={
                "product_id": sample_product.id,
                "type": "INBOUND",
                "quantity": -10,
                "location": "A-01"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_transaction_requires_valid_product(
        self,
        client: AsyncClient,
        admin_token: str
    ):
        """Test that transaction requires a valid product_id."""
        response = await client.post(
            "/api/transactions/",
            json={
                "product_id": 99999,
                "type": "INBOUND",
                "quantity": 10,
                "location": "A-01"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_transaction_without_auth(
        self,
        client: AsyncClient,
        sample_product: Product
    ):
        """Test creating transaction without authentication fails."""
        response = await client.post(
            "/api/transactions/",
            json={
                "product_id": sample_product.id,
                "type": "INBOUND",
                "quantity": 10,
                "location": "A-01"
            }
        )

        assert response.status_code == 403  # HTTPBearer returns 403 when no auth provided


class TestInventoryConsistency:
    """Test cases for ensuring inventory consistency across transactions."""

    @pytest.mark.asyncio
    async def test_multiple_transactions_consistency(
        self,
        client: AsyncClient,
        admin_token: str,
        sample_product: Product,
        sample_inventory: Inventory,
        db_session: AsyncSession
    ):
        """Test that multiple transactions maintain inventory consistency."""
        initial_quantity = sample_inventory.quantity

        # Perform multiple transactions
        await client.post(
            "/api/transactions/",
            json={"product_id": sample_product.id, "type": "INBOUND", "quantity": 20, "location": "A-01"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        await client.post(
            "/api/transactions/",
            json={"product_id": sample_product.id, "type": "OUTBOUND", "quantity": 10, "location": "A-01"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        await client.post(
            "/api/transactions/",
            json={"product_id": sample_product.id, "type": "INBOUND", "quantity": 5, "location": "A-01"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )

        # Verify final inventory: initial + 20 - 10 + 5
        await db_session.refresh(sample_inventory)
        expected_quantity = initial_quantity + 20 - 10 + 5
        assert sample_inventory.quantity == expected_quantity
