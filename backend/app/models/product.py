"""
Product model for product master data.
"""

from sqlalchemy import Column, Integer, String, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class Product(Base):
    """
    Product table for OptiTrack WMS.
    Stores product master data including SKU, pricing, and stock levels.
    """
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    sku = Column(String(100), index=True, nullable=False)  # Remove unique=True globally, enforce unique per user
    name = Column(String(255), nullable=False)
    category = Column(String(100))
    barcode = Column(String(100), index=True) # Remove unique globally
    supplier = Column(String(255))
    cost_price = Column(Numeric(10, 2), nullable=False)
    sell_price = Column(Numeric(10, 2), nullable=False)
    min_stock_level = Column(Integer, default=0, nullable=False)
    unit = Column(String(50), default="pcs")
    image_url = Column(String(500))

    # ความสัมพันธ์พร้อมการลบแบบ CASCADE
    owner = relationship("User", back_populates="products")
    inventory = relationship("Inventory", back_populates="product", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="product", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Product(id={self.id}, sku={self.sku}, name={self.name})>"
