package com.lab.asset;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DigitalAssetRepository extends JpaRepository<DigitalAsset, Long> {
    Optional<DigitalAsset> findByAssetNo(String assetNo);
    List<DigitalAsset> findByAssetType(String assetType);
    Page<DigitalAsset> findByAssetType(String assetType, Pageable pageable);
    Page<DigitalAsset> findByNameContainingIgnoreCase(String keyword, Pageable pageable);
    Page<DigitalAsset> findByAssetTypeAndNameContainingIgnoreCase(String assetType, String keyword, Pageable pageable);
    long countByAssetType(String assetType);
}
