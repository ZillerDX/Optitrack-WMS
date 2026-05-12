"""
Transaction model for stock movements and financial tracking.
"""

from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, DateTime, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class TransactionType(str, enum.Enum):
    """Transaction types for inventory movements."""
    INBOUND = "INBOUND"
    OUTBOUND = "OUTBOUND"
    ADJUST = "ADJUST"


class TransactionStatus(str, enum.Enum):
    """Transaction status for workflow management."""
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class Transaction(Base):
    """
    Transaction table for OptiTrack WMS.
    Records all inventory movements with financial data snapshots.
    """
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ref_code = Column(String(100), unique=True, index=True, nullable=False)
    type = Column(SQLEnum(TransactionType), nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)  # ภาพรวมราคา ณ เวลาที่ทำธุรกรรม
    total_price = Column(Numeric(12, 2), nullable=False)  # ราคารวมที่คำนวณได้ (ราคาต่อหน่วย * จำนวน)
    status = Column(SQLEnum(TransactionStatus), default=TransactionStatus.COMPLETED, nullable=False)
    location = Column(String(50))  # สถานที่ที่เกิดธุรกรรม
    notes = Column(String(500))  # บันทึกเพิ่มเติม
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    # ความสัมพันธ์
    user = relationship("User", back_populates="transactions")
    product = relationship("Product", back_populates="transactions")

    def __repr__(self):
        return f"<Transaction(id={self.id}, ref_code={self.ref_code}, type={self.type})>"
