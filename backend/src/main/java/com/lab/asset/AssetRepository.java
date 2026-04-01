package com.lab.asset;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
@Repository
public interface AssetRepository extends JpaRepository<DigitalAsset, Long> {
    Page<DigitalAsset> findByAssetType(String assetType, Pageable pageable);
    Page<DigitalAsset> findByNameContaining(String keyword, Pageable pageable);
    Page<DigitalAsset> findByStatus(String status, Pageable pageable);
    long countByAssetType(String assetType);
}
