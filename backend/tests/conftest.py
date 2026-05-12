"""
Pytest configuration and fixtures for testing OptiTrack WMS.
Sets up test database and provides common fixtures.
"""

import pytest
import pytest_asyncio
import asyncio
from typing import AsyncGenerator
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool

from main import app as fastapi_app
from app.core.database import Base, get_db
from app.core.security import get_password_hash

# นำเข้าโมเดลทั้งหมดก่อนสร้างเครื่องยนต์เพื่อให้แน่ใจว่าได้ลงทะเบียนแล้ว
from app.models.user import User, UserRole
from app.models.product import Product
from app.models.inventory import Inventory, InventoryStatus
from app.models.transaction import Transaction, TransactionType, TransactionStatus

# URL ฐานข้อมูลทดสอบ - ใช้ SQLite 
# ใช้ check_same_thread=False เพื่อให้ SQLite ทำงานแบบ async ได้
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# ทดสอบด้วย StaticPool เพื่อรักษาการเชื่อมต่อเดียว
test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=False,
)

# สร้างเซสชันทดสอบ
TestSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Create a fresh database session for each test.
    Creates all tables before test and drops them after.
    """
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionLocal() as session:
        yield session
        await session.rollback()

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Create a test client with overridden database dependency.
    """
    async def override_get_db():
        try:
            yield db_session
        finally:
            pass

    fastapi_app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(app=fastapi_app, base_url="http://test") as test_client:
        yield test_client

    fastapi_app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> User:
    """Create and return a test admin user."""
    user = User(
        email="admin@test.com",
        password_hash=get_password_hash("admin123"),
        role=UserRole.ADMIN,
        first_name="Admin",
        last_name="Test",
        is_active=True
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_token(client: AsyncClient, admin_user: User) -> str:
    """Get authentication token for admin user."""
    response = await client.post(
        "/api/auth/login",
        json={"email": "admin@test.com", "password": "admin123"}
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest_asyncio.fixture
async def sample_product(db_session: AsyncSession) -> Product:
    """Create and return a sample product."""
    product = Product(
        sku="TEST-001",
        name="Test Product",
        category="Electronics",
        cost_price=100.00,
        sell_price=150.00,
        min_stock_level=10,
        unit="pcs"
    )
    db_session.add(product)
    await db_session.commit()
    await db_session.refresh(product)
    return product


@pytest_asyncio.fixture
async def sample_inventory(db_session: AsyncSession, sample_product: Product) -> Inventory:
    """Create and return sample inventory for a product."""
    inventory = Inventory(
        product_id=sample_product.id,
        quantity=50,
        location="A-01",
        status=InventoryStatus.IN_STOCK
    )
    db_session.add(inventory)
    await db_session.commit()
    await db_session.refresh(inventory)
    return inventory