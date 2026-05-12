"""
Utility functions for OptiTrack WMS.
Common validation and helper functions used across the application.
"""

from fastapi import HTTPException, status
from app.models.inventory import InventoryStatus
from datetime import datetime
import secrets


def validate_pagination(skip: int, limit: int, max_limit: int = 1000) -> None:
    """
    Validate pagination parameters.

    Args:
        skip: Number of records to skip
        limit: Maximum number of records to return
        max_limit: Maximum allowed limit value

    Raises:
        HTTPException: If parameters are invalid
    """
    if skip < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="skip must be >= 0"
        )
    if limit < 1 or limit > max_limit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"limit must be between 1 and {max_limit}"
        )


def calculate_inventory_status(quantity: int, min_stock_level: int) -> InventoryStatus:
    """
    Calculate inventory status based on quantity and minimum stock level.

    Args:
        quantity: Current quantity in stock
        min_stock_level: Minimum stock level threshold

    Returns:
        InventoryStatus: The calculated inventory status
    """
    if quantity == 0:
        return InventoryStatus.OUT_OF_STOCK
    elif quantity < min_stock_level:
        return InventoryStatus.LOW_STOCK
    return InventoryStatus.IN_STOCK


def not_found_error(resource_type: str, identifier: str | int, id_label: str = "ID") -> HTTPException:
    """
    Create a standardized 404 error response.

    Args:
        resource_type: Type of resource (e.g., "Product", "User")
        identifier: Resource identifier (ID or SKU)
        id_label: Label for the identifier (default: "ID")

    Returns:
        HTTPException: A 404 Not Found exception
    """
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"{resource_type} with {id_label} {identifier} not found"
    )


def generate_ref_code(prefix: str = "TXN") -> str:
    """
    Generate a unique reference code for various entities.

    Args:
        prefix: Prefix for the reference code (e.g., "TXN", "ADJ", "TRF", "PO", "SO")

    Returns:
        A unique reference code in format: PREFIX-YYYYMMDD-XXXXXX
    """
    date_str = datetime.now().strftime("%Y%m%d")
    random_str = secrets.token_hex(3).upper()
    return f"{prefix}-{date_str}-{random_str}"
