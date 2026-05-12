"""
Location model for warehouse locations.
"""

from sqlalchemy import Column, Integer, String, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class Location(Base):
    """
    Location table for OptiTrack WMS.
    Stores valid warehouse locations.
    """
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(50), index=True, nullable=False) # Remove unique globally
    description = Column(String(255), nullable=True)
    capacity = Column(Integer, nullable=False, default=0)

    owner = relationship("User", back_populates="locations")

    def __repr__(self):
        return f"<Location(id={self.id}, name={self.name})>"
