"""
Category model for product categories.
"""

from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base


class Category(Base):
    """
    Category table for OptiTrack WMS.
    Stores product category names.
    """
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_categories_owner_name"),)

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(100), index=True, nullable=False)  # unique per owner (uq_categories_owner_name)

    owner = relationship("User", back_populates="categories")

    def __repr__(self):
        return f"<Category(id={self.id}, name={self.name})>"
