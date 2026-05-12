"""
Category model for product categories.
"""

from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class Category(Base):
    """
    Category table for OptiTrack WMS.
    Stores product category names.
    """
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), index=True, nullable=False) # Remove unique globally

    owner = relationship("User", back_populates="categories")

    def __repr__(self):
        return f"<Category(id={self.id}, name={self.name})>"
