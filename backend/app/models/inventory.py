"""
Inventory model for stock tracking.
"""

from sqlalchemy import Column, Integer, String, ForeignKey, Enum as SQLEnum, UniqueConstraint
from sqlalchemy.orm import relationship
import enum
from app.core.database import Base


class InventoryStatus(str, enum.Enum):
    """Inventory status based on stock levels."""
    IN_STOCK = "IN_STOCK"
    LOW_STOCK = "LOW_STOCK"
    OUT_OF_STOCK = "OUT_OF_STOCK"


class Inventory(Base):
    """
    Inventory table for OptiTrack WMS.
    Tracks current stock quantities and locations.
    """
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    location = Column(String(50), nullable=False, index=True)
    quantity = Column(Integer, default=0, nullable=False)
    status = Column(SQLEnum(InventoryStatus), default=InventoryStatus.IN_STOCK, nullable=False)

    # ข้อจำกัดเฉพาะ: สินค้าหนึ่งรายการสามารถมีบันทึกสินค้าคงคลังได้เพียงรายการเดียวต่อสถานที่
    __table_args__ = (
        UniqueConstraint('product_id', 'location', name='uix_product_location'),
    )

    # ความสัมพันธ์
    product = relationship("Product", back_populates="inventory")

    def __repr__(self):
        return f"<Inventory(id={self.id}, product_id={self.product_id}, quantity={self.quantity})>"
