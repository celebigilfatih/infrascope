"""Logging configuration for NMS service"""

import logging
import logging.handlers
import sys
from pathlib import Path
from nms_service.core.config import config


def setup_logging():
    """Configure logging with file and console handlers"""

    log_dir = Path("/app/logs")
    log_dir.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger("nms")
    logger.setLevel(getattr(logging, config.log_level, logging.INFO))

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, config.log_level, logging.INFO))

    # File handler with rotation
    file_handler = logging.handlers.RotatingFileHandler(
        log_dir / "nms.log",
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=10
    )
    file_handler.setLevel(logging.DEBUG)

    # Formatter
    formatter = logging.Formatter(
        "[%(asctime)s] %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    console_handler.setFormatter(formatter)
    file_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    return logger


# Initialize logger
logger = setup_logging()
