from decimal import Decimal
from datetime import datetime, timedelta
import random

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.category import Category
from app.models.location import Location
from app.models.inventory import Inventory, InventoryStatus
from app.models.transaction import Transaction, TransactionType


async def reset_demo_data(db: AsyncSession, user_id: int):
    """Reset demo account warehouse data with seeded products and transactions."""
    await db.execute(delete(Transaction).where(Transaction.user_id == user_id))
    product_ids_query = select(Product.id).where(Product.owner_id == user_id)
    await db.execute(delete(Inventory).where(Inventory.product_id.in_(product_ids_query)))
    await db.execute(delete(Product).where(Product.owner_id == user_id))
    await db.execute(delete(Category).where(Category.owner_id == user_id))
    await db.execute(delete(Location).where(Location.owner_id == user_id))
    await db.commit()

    categories_list = ["Electronics", "Furniture", "Stationery", "Clothing", "Tools"]
    for cat_name in categories_list:
        db.add(Category(name=cat_name, owner_id=user_id))
    
    locations_list = ["Warehouse-A", "Warehouse-B", "Shelf-Main", "Cold-Storage", "Dock-7"]
    for loc_name in locations_list:
        db.add(Location(name=loc_name, owner_id=user_id))
        
    await db.commit()

    product_templates = [
        ("Laptop", "Electronics", 20000, 35000, "High-performance laptop for professional work."), 
        ("Monitor", "Electronics", 4000, 7500, "4K Ultra HD monitor with 144Hz refresh rate."),
        ("Keyboard", "Electronics", 800, 1500, "Mechanical keyboard with RGB lighting."), 
        ("Mouse", "Electronics", 300, 700, "Wireless ergonomic mouse."),
        ("Printer", "Electronics", 5000, 9000, "Laser printer with duplex printing."), 
        ("Cables", "Electronics", 100, 300, "High-speed USB-C cables."),
        ("Smartphone", "Electronics", 15000, 28000, "Flagship smartphone with great camera."), 
        ("Tablet", "Electronics", 10000, 18000, "Lightweight tablet for entertainment."),
        ("Headphones", "Electronics", 1200, 2500, "Noise-cancelling over-ear headphones."), 
        ("Webcam", "Electronics", 900, 1800, "1080p webcam for video calls."),
        ("Desk", "Furniture", 3000, 6500, "Sturdy wooden desk."), 
        ("Chair", "Furniture", 1500, 3500, "Adjustable office chair."),
        ("Cabinet", "Furniture", 4000, 8000, "Metal filing cabinet."), 
        ("Lamp", "Furniture", 500, 1200, "LED desk lamp with brightness control."),
        ("Bookshelf", "Furniture", 2000, 4500, "5-tier bookshelf."), 
        ("Sofa", "Furniture", 12000, 25000, "Comfortable 3-seater sofa."),
        ("Coffee Table", "Furniture", 2500, 5000, "Modern glass coffee table."), 
        ("Armchair", "Furniture", 3000, 7000, "Soft fabric armchair."),
        ("Wardrobe", "Furniture", 8000, 15000, "Spacious wardrobe with mirror."), 
        ("Dining Table", "Furniture", 6000, 12000, "Solid wood dining table."),
        ("Pen", "Stationery", 10, 25, "Blue ink ballpoint pen."), 
        ("Notebook", "Stationery", 50, 120, "A5 lined notebook."),
        ("Paper A4", "Stationery", 400, 650, "Ream of 500 sheets A4 paper."), 
        ("Marker", "Stationery", 20, 45, "Permanent black marker."),
        ("Stapler", "Stationery", 150, 300, "Heavy-duty stapler."), 
        ("Calculator", "Stationery", 300, 700, "Scientific calculator."),
        ("Folder", "Stationery", 15, 40, "Plastic file folder."), 
        ("Scissors", "Stationery", 40, 90, "Stainless steel scissors."),
        ("Tape", "Stationery", 25, 60, "Clear adhesive tape."), 
        ("Eraser", "Stationery", 5, 15, "Soft white eraser."),
        ("T-Shirt", "Clothing", 150, 450, "100% cotton T-shirt."), 
        ("Jeans", "Clothing", 600, 1200, "Classic blue denim jeans."),
        ("Jacket", "Clothing", 1200, 2500, "Warm winter jacket."), 
        ("Shoes", "Clothing", 800, 2200, "Running sports shoes."),
        ("Cap", "Clothing", 100, 350, "Adjustable baseball cap."), 
        ("Socks", "Clothing", 30, 80, "Cotton ankle socks."),
        ("Dress", "Clothing", 500, 1500, "Casual summer dress."), 
        ("Shorts", "Clothing", 250, 600, "Cotton cargo shorts."),
        ("Hoodie", "Clothing", 800, 1800, "Comfortable fleece hoodie."), 
        ("Belt", "Clothing", 200, 550, "Leather waist belt."),
        ("Hammer", "Tools", 200, 450, "Steel claw hammer."), 
        ("Drill", "Tools", 1500, 3200, "Cordless power drill."),
        ("Screwdriver", "Tools", 100, 250, "Phillips head screwdriver."), 
        ("Wrench", "Tools", 150, 400, "Adjustable crescent wrench."),
        ("Pliers", "Tools", 120, 300, "Needle-nose pliers."), 
        ("Saw", "Tools", 400, 850, "Hand saw for wood."),
        ("Tape Measure", "Tools", 80, 200, "5m retractable tape measure."), 
        ("Level", "Tools", 150, 350, "Bubble spirit level."),
        ("Toolbox", "Tools", 600, 1400, "Portable plastic toolbox."), 
        ("Gloves", "Tools", 50, 150, "Protective work gloves.")
    ]

    now = datetime.now()

    for i, (name, cat, cost, sell, desc) in enumerate(product_templates):
        sku = f"{cat[:3].upper()}-{name[:3].upper()}-{i+1:03d}"
        min_stock = random.randint(10, 30)
        
        product_name = f"{name} model-{random.randint(1, 99)}"
        product = Product(
            owner_id=user_id,
            sku=sku,
            name=product_name,
            category=cat,
            cost_price=Decimal(cost),
            sell_price=Decimal(sell),
            min_stock_level=min_stock,
            unit="pcs"
        )
        db.add(product)
        await db.flush()

        current_stock = 0
        loc = random.choice(locations_list)
        is_low_stock_target = random.random() < 0.3
        
        for day_offset in range(90, -1, -1):
            current_date = now - timedelta(days=day_offset)
            current_date = current_date.replace(
                hour=random.randint(8, 18), 
                minute=random.randint(0, 59), 
                second=random.randint(0, 59)
            )

            should_restock = False
            if day_offset == 90:
                should_restock = True
            elif not is_low_stock_target and current_stock < min_stock:
                should_restock = True
            elif day_offset % random.randint(25, 40) == 0:
                should_restock = True

            if should_restock:
                qty = random.randint(30, 80)
                txn = Transaction(
                    ref_code=f"TXN-IN-{sku}-{day_offset}-{random.randint(100, 999)}",
                    type=TransactionType.INBOUND,
                    quantity=qty,
                    unit_price=product.cost_price,
                    total_price=product.cost_price * qty,
                    location=loc,
                    user_id=user_id,
                    product_id=product.id,
                    created_at=current_date
                )
                current_stock += qty
                db.add(txn)

            out_chance = 0.2
            if is_low_stock_target and day_offset < 30:
                out_chance = 0.6
            
            if current_stock > 0 and random.random() < out_chance:
                for _ in range(random.randint(1, 3)):
                    if current_stock <= 0:
                        break
                    
                    sale_qty = random.randint(1, min(current_stock, 5))
                    txn = Transaction(
                        ref_code=f"TXN-OUT-{sku}-{day_offset}-{random.randint(1000, 9999)}",
                        type=TransactionType.OUTBOUND,
                        quantity=sale_qty,
                        unit_price=product.sell_price,
                        total_price=product.sell_price * sale_qty,
                        location=loc,
                        user_id=user_id,
                        product_id=product.id,
                        created_at=current_date + timedelta(minutes=random.randint(1, 120))
                    )
                    current_stock -= sale_qty
                    db.add(txn)

        inv_status = InventoryStatus.IN_STOCK
        if current_stock == 0:
            inv_status = InventoryStatus.OUT_OF_STOCK
        elif current_stock < min_stock:
            inv_status = InventoryStatus.LOW_STOCK
            
        db.add(Inventory(
            product_id=product.id,
            location=loc,
            quantity=current_stock,
            status=inv_status
        ))

    await db.commit()
