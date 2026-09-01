import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.product import Product
from app.models.category import Category
from app.models.location import Location
from app.models.inventory import Inventory, InventoryStatus

async def seed():
    db_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///optitrack_wms.db")
    engine = create_async_engine(db_url)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with Session() as session:
        res = await session.execute(select(User).filter_by(email="admin@optitrack.io"))
        user = res.scalar_one_or_none()
        if not user:
            user = User(
                email="admin@optitrack.io",
                password_hash=get_password_hash("admin1234"),
                first_name="Warehouse",
                last_name="Commander",
                role=UserRole.ADMIN,
                is_active=True
            )
            session.add(user)
            await session.commit()
            await session.refresh(user)
            print(f"Created user: {user.email} (id={user.id})")
        else:
            print(f"User exists: {user.email} (id={user.id})")
            
        cat_res = await session.execute(select(Category).filter_by(owner_id=user.id))
        if not cat_res.scalars().first():
            cat1 = Category(name="Industrial Equipment", owner_id=user.id)
            cat2 = Category(name="Electronic Components", owner_id=user.id)
            cat3 = Category(name="Raw Materials", owner_id=user.id)
            session.add_all([cat1, cat2, cat3])
            await session.commit()
            
        loc_res = await session.execute(select(Location).filter_by(owner_id=user.id))
        if not loc_res.scalars().first():
            loc1 = Location(name="Zone A - Rack 01", description="Main racking area", capacity=100, owner_id=user.id)
            loc2 = Location(name="Zone B - Cold Storage", description="Climate controlled storage", capacity=50, owner_id=user.id)
            session.add_all([loc1, loc2])
            await session.commit()
            await session.refresh(loc1)
            
            p1 = Product(sku="SKU-IND-8821", name="Hydraulic Servo Valve 3000 PSI", category="Industrial Equipment", unit="pcs", cost_price=450.0, sell_price=680.0, min_stock_level=10, barcode="8851234001", owner_id=user.id)
            p2 = Product(sku="SKU-ELC-1044", name="High-Speed Microcontroller Module", category="Electronic Components", unit="pcs", cost_price=45.0, sell_price=75.0, min_stock_level=20, barcode="8851234002", owner_id=user.id)
            session.add_all([p1, p2])
            await session.commit()
            await session.refresh(p1)
            await session.refresh(p2)
            
            inv1 = Inventory(product_id=p1.id, location="Zone A - Rack 01", quantity=42, status=InventoryStatus.IN_STOCK)
            inv2 = Inventory(product_id=p2.id, location="Zone A - Rack 01", quantity=5, status=InventoryStatus.LOW_STOCK)
            session.add_all([inv1, inv2])
            await session.commit()
            print("Successfully seeded demo warehouse data!")
        else:
            print("Locations and products already seeded.")

if __name__ == "__main__":
    asyncio.run(seed())