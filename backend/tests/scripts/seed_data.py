"""
Seed script for OptiTrack WMS.
20 products | 5 categories | 300 transactions (53% inbound / 47% outbound) | extended preview range
"""

import asyncio
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from app.core.database import AsyncSessionLocal, init_db
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.models.product import Product
from app.models.category import Category
from app.models.inventory import Inventory, InventoryStatus
from app.models.location import Location
from app.models.transaction import Transaction, TransactionType, TransactionStatus

START = datetime.now(timezone.utc).replace(hour=8, minute=0, second=0, microsecond=0) - timedelta(days=330)
TIME_SLOTS = [(9, 0, 0), (11, 15, 0), (13, 30, 0), (15, 45, 0)]
WAREHOUSE_CAPACITY = {
    "Electronics": 650,
    "Furniture": 1100,
    "Tools": 2200,
    "Clothing": 3900,
    "Stationery": 5600,
}

def _dt(day: int, seq: int) -> datetime:
    base = START + timedelta(days=day)
    hour, minute, second = TIME_SLOTS[seq % len(TIME_SLOTS)]
    return base.replace(hour=hour, minute=minute, second=second)

def _ref(d: datetime, seq: int) -> str:
    return f"TXN-{d.strftime('%Y%m%d')}-{seq:06d}"

# (sku, name, category, barcode, supplier, cost, sell, min_stock, unit, location, in_qty, out_qty)
PRODUCTS = [
    ("LAPTOP-001","Laptop Dell XPS 15","Electronics","1000000000001","Dell Inc.",Decimal("25000"),Decimal("32500"),5,"pcs","W-Electronics",15,3),
    ("MACBOOK-001","Laptop MacBook Air M3","Electronics","1000000000002","Apple Inc.",Decimal("38000"),Decimal("48000"),3,"pcs","W-Electronics",12,2),
    ("MONITOR-001","Monitor LG 27\" 4K","Electronics","1000000000003","LG Electronics",Decimal("12000"),Decimal("16500"),5,"pcs","W-Electronics",20,5),
    ("TABLET-001","iPad Pro 12.9\"","Electronics","1000000000004","Apple Inc.",Decimal("28000"),Decimal("35000"),3,"pcs","W-Electronics",14,3),
    ("PHONE-001","Smartphone Samsung S24","Electronics","1000000000005","Samsung",Decimal("32000"),Decimal("41000"),5,"pcs","W-Electronics",18,4),
    ("CHAIR-001","Ergonomic Office Chair","Furniture","2000000000001","Herman Miller",Decimal("8500"),Decimal("12000"),5,"pcs","W-Furniture",35,8),
    ("DESK-001","Standing Desk 160cm","Furniture","2000000000002","Flexispot",Decimal("9000"),Decimal("13500"),3,"pcs","W-Furniture",28,6),
    ("SHELF-001","Bookshelf 5-Tier","Furniture","2000000000003","IKEA",Decimal("2200"),Decimal("3200"),5,"pcs","W-Furniture",42,10),
    ("CABINET-001","Filing Cabinet 3-Drawer","Furniture","2000000000004","Steelcase",Decimal("3500"),Decimal("5000"),4,"pcs","W-Furniture",32,7),
    ("DRILL-001","Cordless Power Drill 18V","Tools","3000000000001","DeWalt",Decimal("3200"),Decimal("4500"),10,"pcs","W-Tools",55,12),
    ("SCREWDRIVER-001","Screwdriver Set 32pcs","Tools","3000000000002","Stanley",Decimal("450"),Decimal("750"),15,"set","W-Tools",100,22),
    ("WRENCH-001","Adjustable Wrench Set","Tools","3000000000003","Bahco",Decimal("800"),Decimal("1200"),10,"set","W-Tools",70,15),
    ("TAPEMEASURE-001","Laser Measuring Tape 50m","Tools","3000000000004","Bosch",Decimal("1200"),Decimal("1900"),8,"pcs","W-Tools",55,12),
    ("TSHIRT-001","Work T-Shirt (Cotton)","Clothing","4000000000001","Gildan",Decimal("120"),Decimal("220"),50,"pcs","W-Clothing",200,45),
    ("POLO-001","Corporate Polo Shirt","Clothing","4000000000002","Gildan",Decimal("280"),Decimal("450"),30,"pcs","W-Clothing",140,30),
    ("JACKET-001","Safety Reflective Jacket","Clothing","4000000000003","3M",Decimal("550"),Decimal("850"),20,"pcs","W-Clothing",100,22),
    ("BOOTS-001","Steel-Toe Work Boots","Clothing","4000000000004","Caterpillar",Decimal("1800"),Decimal("2800"),15,"pair","W-Clothing",60,13),
    ("NOTEBOOK-001","A4 Notebook 100-page","Stationery","5000000000001","Campap",Decimal("35"),Decimal("65"),100,"pcs","W-Stationery",350,75),
    ("PENSET-001","Ballpoint Pen Set 12pcs","Stationery","5000000000002","Pilot",Decimal("85"),Decimal("150"),50,"set","W-Stationery",280,60),
    ("STAPLER-001","Heavy-Duty Stapler","Stationery","5000000000003","Kangaro",Decimal("180"),Decimal("320"),20,"pcs","W-Stationery",90,20),
]

PROFILE_BY_SKU = {
    "LAPTOP-001": "active",
    "MACBOOK-001": "fresh",
    "MONITOR-001": "aging",
    "TABLET-001": "active",
    "PHONE-001": "fresh",
    "CHAIR-001": "aging",
    "DESK-001": "active",
    "SHELF-001": "fresh",
    "CABINET-001": "aging",
    "DRILL-001": "active",
    "SCREWDRIVER-001": "active",
    "WRENCH-001": "aging",
    "TAPEMEASURE-001": "fresh",
    "TSHIRT-001": "active",
    "POLO-001": "fresh",
    "JACKET-001": "aging",
    "BOOTS-001": "active",
    "NOTEBOOK-001": "active",
    "PENSET-001": "aging",
    "STAPLER-001": "fresh",
}

ACTIVE_IN_DAYS = [0, 45, 90, 135, 180, 225, 270, 315]
ACTIVE_OUT_DAYS = [20, 65, 110, 155, 200, 245, 290]
AGING_IN_DAYS = [0, 12, 24, 36, 48, 60, 72, 84]
AGING_OUT_DAYS = [6, 18, 30, 42, 54, 66, 78]
FRESH_IN_DAYS = [210, 225, 240, 255, 270, 285, 300, 315]
FRESH_OUT_DAYS = [217, 232, 247, 262, 277, 292, 307]
PROFILE_SCHEDULES = {
    "active": (ACTIVE_IN_DAYS, ACTIVE_OUT_DAYS),
    "aging": (AGING_IN_DAYS, AGING_OUT_DAYS),
    "fresh": (FRESH_IN_DAYS, FRESH_OUT_DAYS),
}

IN_NOTES  = ["Supplier delivery","Purchase order fulfilled","Stock replenishment","Restock from warehouse","New inventory arrival","Bulk purchase","Emergency restock","Scheduled delivery"]
OUT_NOTES = ["Customer order","Retail sale","Bulk order dispatch","Order fulfillment","Store transfer","Client delivery","Online order"]


async def seed_all():
    print("Seeding OptiTrack WMS Database (Enhanced)...")
    print("=" * 60)
    await init_db()

    async with AsyncSessionLocal() as session:
        admin = User(email="admin@optitrack.com", password_hash=get_password_hash("admin123"),
                     first_name="Admin", last_name="User", role=UserRole.ADMIN, is_active=True)
        session.add(admin)
        await session.flush()
        print(f"  User: {admin.email}")

        for name in ["Electronics", "Furniture", "Tools", "Clothing", "Stationery"]:
            session.add(Category(name=name, owner_id=admin.id))
        for name in ["Electronics", "Furniture", "Tools", "Clothing", "Stationery"]:
            session.add(Location(
                name=f"W-{name}",
                description=f"Warehouse for {name}",
                capacity=WAREHOUSE_CAPACITY[name],
                owner_id=admin.id,
            ))
        await session.flush()
        print("  Categories and locations created.")

        seq = 1
        total_in = total_out = 0
        print("\nCreating products and transactions...")

        for idx, p in enumerate(PRODUCTS):
            sku, name, cat, barcode, supplier, cost, sell, min_lvl, unit, loc, in_qty, out_qty = p
            offset = idx % 4
            profile = PROFILE_BY_SKU[sku]
            in_days, out_days = PROFILE_SCHEDULES[profile]

            product = Product(sku=sku, name=name, category=cat, barcode=barcode, supplier=supplier,
                              cost_price=cost, sell_price=sell, min_stock_level=min_lvl,
                              unit=unit, owner_id=admin.id)
            session.add(product)
            await session.flush()

            running_qty = 0
            plan = []
            for j, day in enumerate(in_days):
                qty = in_qty
                plan.append((day + offset, TransactionType.INBOUND, qty, cost, IN_NOTES[j]))
            for j, day in enumerate(out_days):
                qty = out_qty
                plan.append((day + offset, TransactionType.OUTBOUND, qty, sell, OUT_NOTES[j % len(OUT_NOTES)]))
            plan.sort(key=lambda x: x[0])

            for day, ttype, qty, price, note in plan:
                if ttype == TransactionType.OUTBOUND:
                    qty = min(qty, max(1, running_qty))
                d = _dt(day, seq)
                session.add(Transaction(
                    ref_code=_ref(d, seq), type=ttype, quantity=qty,
                    unit_price=price, total_price=price * qty,
                    status=TransactionStatus.COMPLETED, location=loc,
                    notes=f"{note}: {name}", user_id=admin.id,
                    product_id=product.id, created_at=d,
                ))
                seq += 1
                if ttype == TransactionType.INBOUND:
                    running_qty += qty
                    total_in += 1
                else:
                    running_qty -= qty
                    total_out += 1

            status = (InventoryStatus.IN_STOCK if running_qty > min_lvl
                      else InventoryStatus.LOW_STOCK if running_qty > 0
                      else InventoryStatus.OUT_OF_STOCK)
            session.add(Inventory(product_id=product.id, location=loc,
                                  quantity=running_qty, status=status))
            print(f"  {name} ({sku}) — qty: {running_qty}")

        await session.commit()

    print("\n" + "=" * 60)
    print("Seeded successfully!")
    print(f"  Products:     {len(PRODUCTS)}")
    print(f"  Transactions: {total_in + total_out}  ({total_in} inbound / {total_out} outbound)")
    print(f"  Date range:   {START.strftime('%Y-%m-%d')} to {(START + timedelta(days=329)).strftime('%Y-%m-%d')}")
    print("  Login: admin@optitrack.com / admin123")


if __name__ == "__main__":
    asyncio.run(seed_all())