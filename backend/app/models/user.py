"""
User model for authentication and authorization.
"""

from sqlalchemy import Column, Integer, String, Boolean, Enum as SQLEnum
from sqlalchemy.orm import relationship
import enum
from app.core.database import Base


class UserRole(str, enum.Enum):
    """User roles for role-based access control."""
    ADMIN = "ADMIN"  # Demo/Super Admin
    STAFF = "STAFF"  # Warehouse Staff
    USER = "USER"    # Standard User (Tenant Owner)


class User(Base):
    """
    User table for OptiTrack WMS.
    Stores user credentials and profile information.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole), default=UserRole.ADMIN, nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    image_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # ความสัมพันธ์
    transactions = relationship("Transaction", back_populates="user")
    products = relationship("Product", back_populates="owner", cascade="all, delete-orphan")
    locations = relationship("Location", back_populates="owner", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="owner", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"
