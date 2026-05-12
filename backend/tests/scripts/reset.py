"""
รีเซ็ตฐานข้อมูล - ลบและสร้างใหม่พร้อมสกีมาล่าสุด
"""
import asyncio
import asyncpg
import os
from urllib.parse import urlparse
from app.core.config import settings
from app.core.database import engine, Base
from app.models import User, Product, Inventory, Transaction, Category, Location

async def reset_database():
    """ลบตารางทั้งหมดและสร้างใหม่ตามสกีมา"""
    print("Resetting database...")

    # เชื่อมต่อกับฐานข้อมูล postgres เพื่อลบ/สร้าง optitrack_wms
    try:
        db_url = settings.DATABASE_URL
        parsed = urlparse(db_url)
        
        conn = await asyncpg.connect(
            user=parsed.username or 'postgres',
            password=parsed.password or 'postgres',
            host=parsed.hostname or 'localhost',
            port=parsed.port or 5432,
            database='postgres' # เชื่อมต่อกับ 'postgres' เพื่อจัดการฐานข้อมูลอื่น
        )

        # ปิดการเชื่อมต่อที่ค้างอยู่
        print("   Terminating existing connections...")
        await conn.execute("""
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = 'optitrack_wms'
            AND pid <> pg_backend_pid();
        """)

        # ลบและสร้างฐานข้อมูลใหม่
        print("   Dropping database...")
        await conn.execute('DROP DATABASE IF EXISTS optitrack_wms')

        print("   Creating database...")
        await conn.execute('CREATE DATABASE optitrack_wms')

        await conn.close()
        print("Database reset successfully!")

    except Exception as e:
        print(f"Error resetting database: {e}")
        return False

    # สร้างตารางด้วยสกีมาใหม่
    print("\nCreating tables with new schema...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    print("Tables created successfully!")
    print("\nNew Schema Information:")
    print("   - users")
    print("   - products")
    print("   - inventory")
    print("   - transactions")
    print("   - categories")
    print("   - locations")

    return True

if __name__ == "__main__":
    asyncio.run(reset_database())