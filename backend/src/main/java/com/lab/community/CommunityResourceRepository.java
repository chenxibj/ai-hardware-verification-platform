package com.lab.community;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 社区资源仓库 (#178 US-3.2)
 */
@Repository
public interface CommunityResourceRepository extends JpaRepository<CommunityResource, Long> {
    List<CommunityResource> findByCategory(CommunityResource.ResourceCategory category);
    List<CommunityResource> findByNameContainingIgnoreCase(String keyword);
}
